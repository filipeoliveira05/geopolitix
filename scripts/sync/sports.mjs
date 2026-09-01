// Populates the Supabase `sports_teams` table from Wikipedia's own
// "List of professional sports teams in the United States and Canada"
// article — a single page with one table per major league, in the
// Conference/Division/Team/Location/Venue (or, for MLS, Conference/Team/
// Location/Venue) wikitable shape documented in this script's own parser
// below. No API key needed.
//
// NOT sourced from TheSportsDB despite the original plan (§3) suggesting
// it: confirmed live during planning that TheSportsDB's free key hard-caps
// every league's team list at 10 results (e.g. NFL's 32 teams truncated to
// 10, alphabetically) with no pagination workaround — unusable for "every
// team," which this app's Geography tab needs (a state with a real team
// showing none would read as a bug). Run manually via `npm run sync:sports`,
// AFTER `npm run sync:geography` — this script upserts a city (via Wikidata,
// the same source geography.mjs already uses) when a team's home city isn't
// already one of that state's top-10-by-population + capital rows.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { feature } from "topojson-client";
import { supabaseAdmin, logSync } from "./_supabase-admin.mjs";
import { createChangeLog } from "./_change-log.mjs";
import { fetchJson, lookupCityFacts } from "./_wikidata.mjs";
import { resolveStateQids } from "./geography.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fipsToAbbr = JSON.parse(
  readFileSync(path.join(root, "src", "data", "fips-to-abbr.json"), "utf-8"),
);
const statesTopology = JSON.parse(
  readFileSync(path.join(root, "node_modules", "us-atlas", "states-10m.json"), "utf-8"),
);
// Full state name -> abbr (e.g. "Wisconsin" -> "WI"), same source
// states.mjs itself seeds `states` from — used to resolve a Wikipedia
// location cell's "City, State" text and, as a side effect, to filter out
// Canadian teams (their province name simply won't be in this map).
const nameToAbbr = new Map(
  feature(statesTopology, statesTopology.objects.states)
    .features.map((f) => [f.properties.name, fipsToAbbr[String(f.id)]])
    .filter(([, abbr]) => abbr),
);

const PAGE_TITLE = "List of professional sports teams in the United States and Canada";

const LEAGUES = [
  { key: "NFL", heading: "National Football League" },
  { key: "NBA", heading: "National Basketball Association" },
  { key: "MLB", heading: "Major League Baseball" },
  { key: "NHL", heading: "National Hockey League" },
  { key: "MLS", heading: "Major League Soccer" },
];

async function findSectionIndex(heading) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(PAGE_TITLE)}&prop=sections&format=json`;
  const data = await fetchJson(url);
  const section = data.parse.sections.find((s) => s.line === heading);
  return section ? section.index : null;
}

async function fetchSectionWikitext(sectionIndex) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(PAGE_TITLE)}&prop=wikitext&section=${sectionIndex}&format=json`;
  const data = await fetchJson(url);
  return data.parse.wikitext["*"];
}

/** First [[wikilink]]'s display text ("[[A|B]]" -> "B", "[[A]]" -> "A"), ignoring anything after it. */
function extractLinkText(cell) {
  const match = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(cell ?? "");
  if (!match) return null;
  return (match[2] ?? match[1]).trim();
}

/**
 * Verified live against all 5 target leagues' real wikitext (NFL/NBA/MLB/
 * NHL/MLS, "List of professional sports teams in the United States and
 * Canada") — every data row's cells always end with exactly 3 plain
 * "|"-prefixed cells (Team, Location, Venue), regardless of how many
 * "!"-prefixed rowspan Conference/Division header cells a row also
 * carries — taking the trailing "|"-line containing "||" is robust to the
 * column-count difference between leagues (NFL/NBA/MLB/NHL have 5 columns,
 * MLS has 4) without needing per-league column mapping.
 */
function parseTeamsTable(wikitext) {
  const tableMatch = /\{\|[\s\S]*?\n\|\}/.exec(wikitext);
  if (!tableMatch) return [];
  const rowBlocks = tableMatch[0].split(/\n\|-/).slice(1);
  const teams = [];
  for (const block of rowBlocks) {
    // Join every "|"-prefixed (non-header, non-"|}") line in this row
    // block with "||" before splitting — not just the single line that
    // already contains "||". Caught live: the NHL's Seattle Kraken and
    // Vancouver Canucks rows split Team onto its own "|"-line with
    // Location/Venue on a SEPARATE following "|"-line (unlike every other
    // row, which has all three on one line) — picking only the line that
    // already contained "||" grabbed Location+Venue alone, silently
    // mis-assigning them as [team, location] and losing the real team
    // (Seattle Kraken, a real US team, wrongly ended up in the "skipped"
    // list under a garbage team name).
    const dataLines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && !l.startsWith("|}"));
    if (dataLines.length === 0) continue;
    const cells = dataLines
      .map((l) => l.replace(/^\|/, ""))
      .join("||")
      .split("||");
    if (cells.length < 3) continue;
    const [teamCell, locationCell] = cells.slice(-3, -1);
    const team = extractLinkText(teamCell)?.replace(/'''/g, "").trim();
    const location = extractLinkText(locationCell);
    if (team && location) teams.push({ team, location });
  }
  return teams;
}

function resolveLocation(location) {
  if (location === "Washington, D.C.") return { city: "Washington", stateAbbr: "DC" };
  const commaIdx = location.lastIndexOf(", ");
  if (commaIdx === -1) return null;
  const city = location.slice(0, commaIdx).trim();
  const stateName = location.slice(commaIdx + 2).trim();
  const stateAbbr = nameToAbbr.get(stateName);
  if (!stateAbbr) return null; // non-US (Canada) or unrecognized location text
  return { city, stateAbbr };
}

// A handful of teams' parsed Location text doesn't exactly match any
// Wikidata-resolvable settlement — caught live via a full-database audit
// (2026-09-01): the Yankees' "Bronx" (Wikidata's real entity is labeled
// "The Bronx"), the White Sox's "South Side Chicago" and the Cubs' "North
// Side Chicago" (informal Chicago community-area names, not their own
// standalone Wikidata settlement), and the Braves' "Cumberland" (Truist
// Park's unincorporated home community near Atlanta, itself not a
// population-bearing Wikidata entity) all silently produced a phantom
// `cities` row with name-only data (no population/coordinates) via the
// exact-string cityByKey lookup below falling through to lookupCityFacts(),
// which correctly found nothing. Curated one-off aliases to each team's
// state's real, already-populated city row — same "explicit special case"
// precedent as the Washington D.C. handling above, not a general fuzzy-name
// heuristic (this codebase already tried and reverted heuristic name
// matching elsewhere — see candidates' surname-fallback removal in
// CLAUDE.md — after it produced wrong matches).
const CITY_NAME_ALIASES = {
  "NY:Bronx": "NY:The Bronx",
  "IL:South Side Chicago": "IL:Chicago",
  "IL:North Side Chicago": "IL:Chicago",
  "GA:Cumberland": "GA:Atlanta",
};

/**
 * Every U.S. team across all 5 leagues, as { league, team, city, stateAbbr }.
 * `skipped` collects non-US/unparsed rows for the caller's change log.
 */
export async function parseAllLeagues() {
  const teams = [];
  const skipped = [];
  for (const league of LEAGUES) {
    const sectionIndex = await findSectionIndex(league.heading);
    if (sectionIndex === null) {
      skipped.push(`${league.key}: section "${league.heading}" not found`);
      continue;
    }
    const wikitext = await fetchSectionWikitext(sectionIndex);
    const parsed = parseTeamsTable(wikitext);
    for (const { team, location } of parsed) {
      const resolved = resolveLocation(location);
      if (!resolved) {
        skipped.push(`${league.key}: ${team} (${location})`);
        continue;
      }
      teams.push({ league: league.key, team, ...resolved });
    }
  }
  return { teams, skipped };
}

async function main() {
  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();
  const changeLog = createChangeLog();

  const { teams, skipped } = await parseAllLeagues();
  console.log(`Parsed ${teams.length} U.S. teams across ${LEAGUES.length} leagues.`);
  for (const league of LEAGUES) {
    const count = teams.filter((t) => t.league === league.key).length;
    console.log(`  ${league.key}: ${count} teams`);
  }
  for (const s of skipped) changeLog.record("skipped (non-US or unparsed)", s);

  const stateQids = await resolveStateQids();

  const { data: existingCities, error: citiesSelectError } = await supabase
    .from("cities")
    .select("id, name, state_id");
  if (citiesSelectError) throw citiesSelectError;
  const cityByKey = new Map(existingCities.map((c) => [`${c.state_id}:${c.name}`, c]));

  const teamRows = [];
  for (const t of teams) {
    const key = `${t.stateAbbr}:${t.city}`;
    const aliasKey = CITY_NAME_ALIASES[key] ?? key;
    let city = cityByKey.get(aliasKey);
    if (!city) {
      const stateQid = stateQids.get(t.stateAbbr);
      const cityFacts = stateQid ? await lookupCityFacts(t.city, stateQid) : null;
      if (!cityFacts) {
        changeLog.record(
          "no city facts (from sports)",
          `${t.team}: "${t.city}, ${t.stateAbbr}" not resolvable on Wikidata`,
        );
      }
      const { data: inserted, error: insertError } = await supabase
        .from("cities")
        .upsert(
          {
            state_id: t.stateAbbr,
            name: t.city,
            population: cityFacts?.population ?? null,
            latitude: cityFacts?.latitude ?? null,
            longitude: cityFacts?.longitude ?? null,
            is_capital: false,
          },
          { onConflict: "state_id,name" },
        )
        .select("id, name, state_id")
        .single();
      if (insertError) throw insertError;
      city = inserted;
      cityByKey.set(key, city);
      changeLog.record("new city (from sports)", `${t.city}, ${t.stateAbbr}`);
    }
    teamRows.push({ league: t.league, name: t.team, city_id: city.id });
  }

  const { data: existingTeams, error: existingTeamsError } = await supabase
    .from("sports_teams")
    .select("league, name, city_id");
  if (existingTeamsError) throw existingTeamsError;
  const existingByKey = new Map(existingTeams.map((r) => [`${r.league}:${r.name}`, r]));

  for (const row of teamRows) {
    const key = `${row.league}:${row.name}`;
    const previous = existingByKey.get(key);
    if (!previous) changeLog.record("new team", `${row.league} ${row.name}`);
    else if (previous.city_id !== row.city_id) changeLog.record("updated (city changed)", `${row.league} ${row.name}`);
    else changeLog.record("unchanged");
  }

  const { error } = await supabase.from("sports_teams").upsert(teamRows, { onConflict: "league,name" });
  await logSync(supabase, {
    source: "Wikipedia (List of professional sports teams in the US and Canada)",
    startedAt,
    error,
    job: "sports",
  });
  if (error) throw error;

  console.log(`Synced ${teamRows.length} teams — ${changeLog.summary()}.`);
}

// Guarded the same way geography.mjs's main() is — see that file's comment
// for why (an unguarded top-level main() call fires as a side effect of
// merely importing a function from this module, e.g. for a dry-run test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
