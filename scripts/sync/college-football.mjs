// Populates the Supabase `college_football_programs` table from Wikipedia's own
// "List of NCAA Division I FBS football programs" article — one big wikitable, 138 schools,
// unlike sports.mjs's per-league sections on a different page. Run manually via
// `npm run sync:college-football`.
//
// A deliberately separate table from sports_teams (see the migration's own comment) rather than a
// new league value on it — a college program carries a conference (no equivalent field on a pro
// team) and is amateur/institutional, not "major-league" the way sports_teams' UI copy already
// commits to.
//
// The table's columns are, in fixed order: School, Nickname, City, State, Enrollment, Current
// conference, Former conferences, First year, Joined FBS, First joined FBS, Left FBS — confirmed
// live against the real wikitext for multiple schools before trusting this. Only the trailing
// columns (from "First year" on) vary per row (some use colspan to merge "Joined FBS"/"First
// joined FBS" into one cell for schools that joined FBS at founding) — School/Nickname/City/
// State/Enrollment/Current conference (cells 0-5) are always present at those fixed positions
// regardless of that trailing variability, so this parser reads by POSITION from the front, unlike
// sports.mjs's parser, which reads by position from the back (its tables vary in LEADING column
// count instead — a Conference/Division header column some leagues have and others don't).
//
// Unlike sports.mjs's location cells (a single "City, State" string needing nameToAbbr lookup),
// this page's State cell is already a clean 2-letter abbreviation link (e.g. [[Alabama|AL]]) — no
// lookup table needed at all.
import { supabaseAdmin, logSync } from "./_supabase-admin.mjs";
import { createChangeLog } from "./_change-log.mjs";
import { fetchJson } from "./_wikidata.mjs";
import { extractLinkText, extractLinkTarget } from "./_wikilinks.mjs";

const PAGE_TITLE = "List of NCAA Division I FBS football programs";

export async function fetchPageWikitext() {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(PAGE_TITLE)}&prop=wikitext&format=json`;
  const data = await fetchJson(url);
  const wikitext = data.parse.wikitext["*"];
  // {{okina}} is a MediaWiki template that renders to the ʻokina character (U+02BB), used only in
  // "Hawai{{okina}}i" here — caught live, the plain regex parser below has no template engine and
  // was leaving the raw "{{okina}}" text in the school name untouched. A single substitution up
  // front (rather than a full template resolver) is enough since this is the one template used
  // anywhere in this page's data rows.
  return wikitext.replace(/\{\{okina\}\}/gi, "ʻ");
}

/**
 * Reads only cells 0-5 (School, Nickname, City, State, Enrollment, Current conference) by fixed
 * position from the front of each row — see the file header comment for why this is safe despite
 * the table's variable trailing column count.
 */
export function parseProgramsTable(wikitext) {
  const tableMatch = /\{\|[\s\S]*?\n\|\}/.exec(wikitext);
  if (!tableMatch) return [];
  const rowBlocks = tableMatch[0].split(/\n\|-/).slice(1);
  const programs = [];
  for (const block of rowBlocks) {
    const dataLines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && !l.startsWith("|}"));
    if (dataLines.length === 0) continue;
    const cells = dataLines.map((l) => l.replace(/^\|/, "").trim());
    if (cells.length < 6) continue;
    const school = extractLinkText(cells[0]);
    const wikipediaTitle = extractLinkTarget(cells[1]); // nickname cell links to the program's own article
    const nickname = extractLinkText(cells[1]);
    const city = extractLinkText(cells[2]);
    const stateAbbr = extractLinkText(cells[3]);
    const conference = extractLinkText(cells[5]);
    if (school && city && stateAbbr) {
      programs.push({ school, nickname, city, stateAbbr, conference, wikipediaTitle });
    }
  }
  return programs;
}

async function main() {
  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();
  const changeLog = createChangeLog();

  console.log(`Fetching "${PAGE_TITLE}"...`);
  const wikitext = await fetchPageWikitext();
  const programs = parseProgramsTable(wikitext);
  console.log(`Parsed ${programs.length} FBS programs.`);

  const { data: states, error: statesError } = await supabase.from("states").select("id");
  if (statesError) throw statesError;
  const validStateIds = new Set(states.map((s) => s.id));

  const skipped = [];
  const rows = [];
  for (const p of programs) {
    if (!validStateIds.has(p.stateAbbr)) {
      skipped.push(`${p.school} (${p.city}, ${p.stateAbbr})`);
      continue;
    }
    rows.push({
      school: p.school,
      nickname: p.nickname,
      city_name: p.city,
      state_id: p.stateAbbr,
      conference: p.conference,
      wikipedia_title: p.wikipediaTitle,
    });
  }
  for (const s of skipped) changeLog.record("skipped (unrecognized state)", s);

  const { data: existingPrograms, error: existingError } = await supabase
    .from("college_football_programs")
    .select("school, nickname, city_name, state_id, conference, wikipedia_title");
  if (existingError) throw existingError;
  const existingBySchool = new Map(existingPrograms.map((r) => [r.school, r]));

  for (const row of rows) {
    const previous = existingBySchool.get(row.school);
    if (!previous) changeLog.record("new program", row.school);
    else if (
      previous.nickname !== row.nickname ||
      previous.city_name !== row.city_name ||
      previous.state_id !== row.state_id ||
      previous.conference !== row.conference ||
      previous.wikipedia_title !== row.wikipedia_title
    ) {
      changeLog.record("updated", row.school);
    } else changeLog.record("unchanged");
  }

  const { error: upsertError } = await supabase
    .from("college_football_programs")
    .upsert(rows, { onConflict: "school" });
  if (upsertError) {
    await logSync(supabase, { source: `Wikipedia (${PAGE_TITLE})`, startedAt, error: upsertError, job: "college_football" });
    throw upsertError;
  }

  // Same stale-row cleanup pattern just added to sports.mjs — a school that closes its program or
  // gets renamed on Wikipedia would otherwise sit here forever since upsert alone never removes it.
  const freshSchools = new Set(rows.map((r) => r.school));
  const staleSchools = existingPrograms.filter((r) => !freshSchools.has(r.school));
  for (const p of staleSchools) changeLog.record("removed (no longer listed)", p.school);
  if (staleSchools.length > 0) {
    const { error: deleteError } = await supabase
      .from("college_football_programs")
      .delete()
      .in("school", staleSchools.map((p) => p.school));
    if (deleteError) throw deleteError;
  }

  await logSync(supabase, {
    source: `Wikipedia (${PAGE_TITLE})`,
    startedAt,
    error: null,
    warnings: skipped,
    job: "college_football",
  });

  console.log(`Synced ${rows.length} programs — ${changeLog.summary()}.`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped (unrecognized state):`);
    for (const s of skipped) console.log(`  ${s}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
