// Populates the Supabase `college_basketball_programs` table by joining two Wikipedia pages —
// "List of NCAA Division I men's basketball programs" (School/Nickname/Home arena/Conference/
// Tournament stats, ~366 rows, no city/state at all) and "List of NCAA Division I institutions"
// (School/Common name/Nickname/City/State/Type/Subdivision/Primary conference, ~362 rows, covers
// basketball-only schools with no football program too — confirmed live for DePaul/Xavier/
// Butler/Marquette/Georgetown). Run manually via `npm run sync:college-basketball`.
//
// Same separate-table reasoning as college_football_programs (see that table's migration) — a
// college program carries a conference, is amateur/institutional, and doesn't belong in
// sports_teams' "major-league" framing.
//
// THE JOIN: keyed on each school's wikilink TARGET, not display text — the two pages are
// independently maintained and don't always agree on display text (e.g. the basketball page shows
// "University of Hawai{{okina}}i at Mānoa (Hawaii)" as display text). A direct target match works
// for most schools (confirmed live: "University at Albany" resolves identically on both pages),
// but NOT all — caught live for Hawaii specifically: the basketball page's wikilink target is the
// plain-ASCII "University of Hawaii at Manoa", while the institutions page's target is
// "University of Hawaiʻi at Mānoa" (real ʻokina + macron, no {{okina}} template this time). These
// are the same article by REDIRECT, not by string equality — confirmed live via MediaWiki's own
// `action=query&redirects=1`, which resolves the ASCII form straight to the diacritic form (same
// pageid). So any basketball-page target that doesn't match the institutions map directly gets
// resolved through this API before being treated as a real miss — bounded to just the handful of
// actual mismatches, not one API call per school.
import { supabaseAdmin, logSync } from "./_supabase-admin.mjs";
import { createChangeLog } from "./_change-log.mjs";
import { fetchJson, chunk } from "./_wikidata.mjs";
import { extractLinkText, extractLinkTarget } from "./_wikilinks.mjs";
import { backfillLogoAndBio } from "./_wikipedia.mjs";

const INSTITUTIONS_PAGE = "List of NCAA Division I institutions";
const BASKETBALL_PAGE = "List of NCAA Division I men's basketball programs";

export async function fetchPageWikitext(pageTitle) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json`;
  const data = await fetchJson(url);
  // {{okina}} is a MediaWiki template for the ʻokina character (U+02BB) — same fix
  // college-football.mjs needed for Hawaii's school name, applied here defensively to both pages
  // (a no-op wherever the template doesn't occur).
  return data.parse.wikitext["*"].replace(/\{\{okina\}\}/gi, "ʻ");
}

/** Every {| ... |} table on the page — the institutions page in particular has a small
 * "Returning/Departing/Joining" legend table BEFORE the real one, so "the first table on the
 * page" (what college-football.mjs's single-table page can safely assume) is the wrong table
 * here; caught live via a 0-row parse. Callers pick the right table by header content instead. */
function extractTables(wikitext) {
  const tables = [];
  const re = /\{\|[\s\S]*?\n\|\}/g;
  let m;
  while ((m = re.exec(wikitext))) tables.push(m[0]);
  return tables;
}

/** School(0)/Common name(1)/Nickname(2)/City(3)/State(4)/... — no colspan/rowspan in any of these
 * tables (confirmed live), so a fixed-position read is safe. The page has THREE City/State tables,
 * not one: the main "full members" table, a small "reclassifying members" table (schools moving up
 * from D-II with a transition timeline — same first-5-column shape, just extra trailing columns),
 * and an empty collapsible header-only template artifact (contributes zero real rows, harmless to
 * include). Caught live: an earlier version only used the FIRST City/State table found and missed
 * 4 real reclassifying-member schools (Mercyhurst, New Haven, West Florida, West Georgia) that
 * exist on the basketball programs page with real city/state data sitting right there on this
 * page too — just in the second table, not "no data available" the way a genuine gap would be.
 *
 * `commonName` (cells[1]) is plain text, not a wikilink, so extractLinkText doesn't apply — but
 * it isn't always CLEAN plain text either, in two different ways caught live: "University at
 * Albany"'s cell reads `Albany{{refn|group=N|Alternately "UAlbany".}}`, a footnote template stuck
 * directly to the name (fixed by just stripping it); but "St. John's University"'s cell reads
 * `{{sort|Saint Johns|St. John's}}` — a {{sort|SortKey|Display}} template used so the table still
 * alphabetizes correctly despite the display text starting with "St." (the same reason the
 * basketball page's School column wraps names in {{sort|}}, see below) — here a blanket strip
 * would delete the ENTIRE cell, including the actual name, not just noise. cleanCommonName()
 * below handles {{sort|}} by keeping its second argument; anything else {{...}} is assumed to be
 * pure noise (a footnote, etc.) and stripped entirely.
 *
 * The strip itself has to LOOP, not run once — caught live via California State University,
 * Bakersfield's cell: `Bakersfield{{refn|group=N|...text...<ref>{{cite web |url=...}}</ref>...
 * more text...}}`, a footnote template with a further-nested {{cite web}} template inside its own
 * <ref> tag. The strip regex only matches a `{{...}}` span with no braces inside it, so a single
 * pass finds and removes just the innermost {{cite web}}, leaving the now-unnested {{refn}}
 * wrapper (and all its noise text) sitting in the output untouched — a single non-loop `.replace`
 * has no way to notice the outer template became strippable only after the inner one was gone.
 * Looping until the string stops changing removes one level of nesting per pass, however deep it
 * goes, and converged live to the correct plain "Bakersfield" for this exact case. */
function cleanCommonName(text) {
  const sortMatch = /\{\{sort\|[^|{}]*\|([^{}]*)\}\}/i.exec(text);
  if (sortMatch) return sortMatch[1].trim();
  let cleaned = text;
  let previous;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(/\{\{[^{}]*\}\}/g, "");
  } while (cleaned !== previous);
  return cleaned.trim();
}
export function parseInstitutionsTable(wikitext) {
  const tables = extractTables(wikitext).filter((t) => /!\s*City\b/.test(t) && /!\s*State\b/.test(t));
  const rows = [];
  for (const tableMatch of tables) {
    const rowBlocks = tableMatch.split(/\n\|-/).slice(1);
    for (const block of rowBlocks) {
      const dataLines = block
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("|") && !l.startsWith("|}"));
      if (dataLines.length === 0) continue;
      const cells = dataLines.map((l) => l.replace(/^\|/, "").trim());
      if (cells.length < 5) continue;
      const target = extractLinkTarget(cells[0]);
      const commonName = cleanCommonName(cells[1]) || null;
      const city = extractLinkText(cells[3]);
      const state = extractLinkText(cells[4]);
      if (target && city && state) rows.push({ target, commonName, city, state });
    }
  }
  return rows;
}

/** School(0)/Nickname(1)/Home arena(2)/Conference(3)/Tournament appearances(4)/Final Four(5)/
 * Championships(6) — also no colspan/rowspan (confirmed live). Home arena/tournament stats are
 * fetched-past but unused, same as sports.mjs's Venue column. */
export function parseBasketballTable(wikitext) {
  const tableMatch = extractTables(wikitext).find((t) => /!\s*Nickname\b/.test(t) && /!\s*Conference\b/.test(t));
  if (!tableMatch) return [];
  const rowBlocks = tableMatch.split(/\n\|-/).slice(1);
  const programs = [];
  for (const block of rowBlocks) {
    const dataLines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && !l.startsWith("|}"));
    if (dataLines.length === 0) continue;
    const cells = dataLines.map((l) => l.replace(/^\|/, "").trim());
    if (cells.length < 4) continue;
    const school = extractLinkText(cells[0]);
    const target = extractLinkTarget(cells[0]);
    const nickname = extractLinkText(cells[1]);
    const wikipediaTitle = extractLinkTarget(cells[1]); // the program's own article, e.g. "Albany Great Danes men's basketball"
    const conference = extractLinkText(cells[3]);
    if (school && target) programs.push({ school, target, nickname, wikipediaTitle, conference });
  }
  return programs;
}

/** Resolves each of `targets` through MediaWiki's redirect API, batched 50 per request (the
 * anonymous-request cap). Returns a Map from the original target to its final canonical title —
 * only for titles that actually redirect; a title with no redirect is simply absent. */
export async function resolveRedirects(targets) {
  const resolved = new Map();
  for (const batch of chunk(targets, 50)) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(batch.join("|"))}&redirects=1&format=json`;
    const data = await fetchJson(url);
    for (const r of data.query?.redirects ?? []) resolved.set(r.from, r.to);
  }
  return resolved;
}

async function main() {
  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();
  const changeLog = createChangeLog();

  console.log(`Fetching "${INSTITUTIONS_PAGE}"...`);
  const institutionsWikitext = await fetchPageWikitext(INSTITUTIONS_PAGE);
  const institutions = parseInstitutionsTable(institutionsWikitext);
  console.log(`Parsed ${institutions.length} institutions (city/state source).`);

  console.log(`Fetching "${BASKETBALL_PAGE}"...`);
  const basketballWikitext = await fetchPageWikitext(BASKETBALL_PAGE);
  const basketballPrograms = parseBasketballTable(basketballWikitext);
  console.log(`Parsed ${basketballPrograms.length} basketball programs.`);

  const locationByTarget = new Map(
    institutions.map((i) => [i.target, { commonName: i.commonName, city: i.city, state: i.state }]),
  );

  const unresolvedTargets = basketballPrograms
    .map((p) => p.target)
    .filter((t) => !locationByTarget.has(t));
  console.log(`${unresolvedTargets.length} program(s) didn't match directly — resolving redirects...`);
  const redirectMap = await resolveRedirects(unresolvedTargets);

  const { data: states, error: statesError } = await supabase.from("states").select("id");
  if (statesError) throw statesError;
  const validStateIds = new Set(states.map((s) => s.id));

  const skipped = [];
  const rows = [];
  for (const p of basketballPrograms) {
    let location = locationByTarget.get(p.target);
    if (!location) {
      const canonical = redirectMap.get(p.target);
      if (canonical) location = locationByTarget.get(canonical);
    }
    if (!location) {
      skipped.push(`${p.school} (no city/state match for "${p.target}")`);
      continue;
    }
    if (!validStateIds.has(location.state)) {
      skipped.push(`${p.school} (unrecognized state "${location.state}")`);
      continue;
    }
    rows.push({
      // The institutions page's Common name (e.g. "Charlotte", "DePaul", "Hawaiʻi") instead of the
      // basketball page's own School cell (e.g. "University of North Carolina at Charlotte") —
      // caught live: the basketball page's editors consistently use full institutional names,
      // unlike the football source page, which uses short common names as display text throughout.
      // Falls back to the basketball page's own name in the (unobserved in a full live run, but not
      // provable impossible) case of an institutions row with a genuinely empty Common name cell.
      school: location.commonName ?? p.school,
      nickname: p.nickname,
      city_name: location.city,
      state_id: location.state,
      conference: p.conference,
      wikipedia_title: p.wikipediaTitle,
      // Powers /college-basketball/[id]'s own per-row freshness note — see sports.mjs's identical
      // comment on why every row in a given run ends up with the same timestamp here.
      last_synced_at: new Date().toISOString(),
    });
  }
  for (const s of skipped) changeLog.record("skipped (no city/state match)", s);

  const { data: existingPrograms, error: existingError } = await supabase
    .from("college_basketball_programs")
    .select("id, school, nickname, city_name, state_id, conference, wikipedia_title, logo_url, bio_summary");
  if (existingError) throw existingError;
  const existingBySchool = new Map(existingPrograms.map((r) => [r.school, r]));

  for (const row of rows) {
    const previous = existingBySchool.get(row.school);
    // See sports.mjs's identical comment — carry the existing logo/bio forward unless this row is
    // new or its wikipedia_title changed, so a normal rerun doesn't re-fetch all 365 programs (a
    // real ~35-40% of which come back with no logo anyway, per backfillLogoAndBio's own comment).
    const sameTitle = previous?.wikipedia_title === row.wikipedia_title;
    row.logo_url = sameTitle ? previous.logo_url : null;
    row.bio_summary = sameTitle ? previous.bio_summary : null;
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

  // See sports.mjs's identical comment — keyed on bio_summary, not logo_url, so a program whose
  // logo_url was already fetched under the pre-bio_summary migration doesn't get skipped forever.
  const needsBackfill = rows.filter((r) => r.wikipedia_title && !r.bio_summary);
  await backfillLogoAndBio(needsBackfill, changeLog, (r) => r.school);

  const { error: upsertError } = await supabase
    .from("college_basketball_programs")
    .upsert(rows, { onConflict: "school" });
  if (upsertError) {
    await logSync(supabase, { source: `Wikipedia (${BASKETBALL_PAGE} + ${INSTITUTIONS_PAGE})`, startedAt, error: upsertError, job: "college_basketball" });
    throw upsertError;
  }

  // Same stale-row cleanup pattern as sports.mjs/college-football.mjs — deletes by id, not by
  // school name. A delete filtered by name silently failed to remove a real stale row live: a
  // malformed school name (the pre-cleanCommonName-fix "Bakersfield{{refn|...}}" garbage, full of
  // quotes/braces/angle brackets) broke PostgREST's `in.()` filter syntax, leaving the row behind
  // with no error surfaced. Deleting by the primary key sidesteps this whole class of bug — no
  // value from the name column ever needs to survive being embedded in a filter string.
  const freshSchools = new Set(rows.map((r) => r.school));
  const staleSchools = existingPrograms.filter((r) => !freshSchools.has(r.school));
  for (const p of staleSchools) changeLog.record("removed (no longer listed)", p.school);
  if (staleSchools.length > 0) {
    const { error: deleteError } = await supabase
      .from("college_basketball_programs")
      .delete()
      .in("id", staleSchools.map((p) => p.id));
    if (deleteError) throw deleteError;
  }

  await logSync(supabase, {
    source: `Wikipedia (${BASKETBALL_PAGE} + ${INSTITUTIONS_PAGE})`,
    startedAt,
    error: null,
    warnings: skipped,
    job: "college_basketball",
  });

  console.log(`Synced ${rows.length} programs — ${changeLog.summary()}.`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const s of skipped) console.log(`  ${s}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
