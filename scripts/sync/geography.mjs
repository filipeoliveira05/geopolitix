// Populates the Supabase `states` table's population/region/flag_url/capital_city_id and the
// `cities` table (top 10 most populous cities + capital per state) — entirely from World
// Population Review, no API key needed. Run manually via `npm run sync:geography`.
//
// Rewritten from scratch 2026-09-01, replacing an earlier Wikidata-SPARQL-based version.
// Wikidata's population figures are whatever a contributor last entered, with no guarantee of
// ever being refreshed (confirmed live: Jacksonville, FL was pinned to the 2020 Census with no
// newer statement on the entity at all) — and getting "is this a real city" right from Wikidata's
// class labels alone (NECTA regions, fictional entities, civil townships, Alaska's organized
// boroughs, county-seat/county-entity collisions) took many real, live-discovered iterations, each
// documented in this project's CLAUDE.md history. WPR's own per-state `rank` field is already
// exactly "top 10 most populous, full stop" with no re-derivation needed, and its state pages
// carry population/capital/flag directly — one source for everything this script needs, at the
// cost of accepting whatever WPR's own methodology is (a modeled current-year estimate, not a
// census figure) rather than Wikidata's patchwork of contributor-entered numbers.
import { supabaseAdmin, logSync } from "./_supabase-admin.mjs";
import { createChangeLog } from "./_change-log.mjs";
import { mapWithConcurrency, USER_AGENT } from "./_wikipedia.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const regions = JSON.parse(
  readFileSync(path.join(root, "src", "data", "state-regions.json"), "utf-8"),
);

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return res.text();
}

// worldpopulationreview.com/us-cities/<state> embeds a clean, already-ranked JSON array
// (`const data = "[...]";` inside a page-local <script>, JS-string-escaped) rather than requiring
// table-cell parsing — confirmed live across many states before trusting this. `JSON.parse('"' +
// captured + '"')` undoes the JS-string escaping (valid here since every escape WPR emits, e.g.
// \", \\, \n, <, is also valid JSON string syntax), leaving the raw JSON array TEXT, which a
// second JSON.parse turns into the actual array.
const DATA_BLOB_PATTERN = /const data = "((?:[^"\\]|\\.)*)";/;

async function fetchCityRankings(stateName) {
  const html = await fetchHtml(`https://worldpopulationreview.com/us-cities/${slugify(stateName)}`);
  const match = DATA_BLOB_PATTERN.exec(html);
  if (!match) throw new Error("no embedded data blob found on us-cities page");
  const jsonText = JSON.parse(`"${match[1]}"`);
  return JSON.parse(jsonText).sort((a, b) => a.rank - b.rank);
}

// worldpopulationreview.com/states/<state> has a readable population sentence ("Michigan ... has
// a population of 10,155,806, making it the 10th most populated state") and a "Capital:"
// definition-list entry, both confirmed live and stable across several states before trusting
// this as a real extraction target, not brittle scraping of arbitrary prose.
const STATE_POPULATION_PATTERN = /has a population of <span class="font-bold">([\d,]+)<\/span>/;
const CAPITAL_PATTERN = /Capital:<\/dt><dd class="ml-1 inline"><a[^>]*>([^<]+)<\/a>/;

async function fetchStateFacts(stateName) {
  const html = await fetchHtml(`https://worldpopulationreview.com/states/${slugify(stateName)}`);
  const popMatch = STATE_POPULATION_PATTERN.exec(html);
  const capitalMatch = CAPITAL_PATTERN.exec(html);
  return {
    population: popMatch ? Number(popMatch[1].replace(/,/g, "")) : null,
    capitalName: capitalMatch ? capitalMatch[1] : null,
  };
}

// DC is not treated as "a state" on WPR's own site: worldpopulationreview.com/states/
// district-of-columbia has no "has a population of" sentence (confirmed live — the page exists
// but with different prose), and worldpopulationreview.com/us-cities/district-of-columbia
// redirects straight to a single Washington city page rather than a ranked list (DC has no
// sub-cities). Synthesized directly instead of forcing DC through the normal per-state path —
// same one-off-exception precedent this codebase already has for DC elsewhere (governors.mjs,
// the original geography.mjs).
const DC_POPULATION_PATTERN = /has an? \d{4} population of <span class="font-bold">([\d,]+)<\/span>/;

async function fetchDCFacts() {
  const html = await fetchHtml("https://worldpopulationreview.com/us-cities/district-of-columbia/washington");
  const match = DC_POPULATION_PATTERN.exec(html);
  return { population: match ? Number(match[1].replace(/,/g, "")) : null };
}

// Predictable, confirmed-live URL pattern — no fetch needed to resolve it, unlike Wikidata's P41
// flag statement (which didn't exist for every state and needed its own query).
function flagUrl(abbr) {
  return `https://worldpopulationreview.com/images/state-flags/w1280/${abbr.toLowerCase()}.png`;
}

/**
 * Matched with a trailing " City" stripped from both sides, not exact string equality — WPR is
 * internally inconsistent about Idaho's capital: the state page's "Capital:" link reads "Boise",
 * but the same city's row in the ranked us-cities list is named "Boise City" (its formal legal
 * name) — confirmed live, not a hypothetical. Exact matching would treat these as two different
 * places and produce a real duplicate. A full nationwide check found this is the only such
 * collision (unlike the earlier Wikidata-vs-WPR design, WPR's own state-page capital name and its
 * own ranked-list city name agree for every other state, including MN's "St. Paul" — the old
 * "Saint Paul" spelling was purely a Wikidata artifact that no longer exists now that Wikidata is
 * gone from this pipeline entirely).
 */
function stripCitySuffix(name) {
  return name.replace(/ City$/i, "");
}

function buildCitiesForState(rankings, capitalName) {
  const topTen = rankings.slice(0, 10).map((r) => ({ name: r.city, population: r.pop2026, isCapital: false }));
  if (!capitalName) return topTen;
  const capitalCore = stripCitySuffix(capitalName);
  const already = topTen.find((c) => stripCitySuffix(c.name) === capitalCore);
  if (already) {
    already.isCapital = true;
    return topTen;
  }
  const match = rankings.find((r) => stripCitySuffix(r.city) === capitalCore);
  topTen.push({ name: capitalName, population: match?.pop2026 ?? null, isCapital: true });
  return topTen;
}

async function main() {
  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();
  const changeLog = createChangeLog();

  const { data: states, error: statesError } = await supabase.from("states").select("id, name");
  if (statesError) throw statesError;

  console.log(`Fetching geography facts for ${states.length} states (concurrency 2)...`);
  const warnings = [];
  const results = await mapWithConcurrency(states, 2, async (state) => {
    if (state.id === "DC") {
      let dcFacts;
      try {
        dcFacts = await fetchDCFacts();
      } catch (err) {
        warnings.push(`DC: WPR fetch failed — ${err.message}`);
        return { abbr: "DC", failed: true };
      }
      console.log(`  DC: 1 city (Washington)`);
      return {
        abbr: "DC",
        population: dcFacts.population,
        cities: [{ name: "Washington", population: dcFacts.population, isCapital: true }],
      };
    }
    let facts, rankings;
    try {
      [facts, rankings] = await Promise.all([fetchStateFacts(state.name), fetchCityRankings(state.name)]);
    } catch (err) {
      warnings.push(`${state.id}: WPR fetch failed — ${err.message}`);
      console.log(`  ${state.id}: fetch failed, skipping`);
      return { abbr: state.id, failed: true };
    }
    const cities = buildCitiesForState(rankings, facts.capitalName);
    console.log(`  ${state.id}: ${cities.length} cities`);
    return { abbr: state.id, population: facts.population, cities };
  });

  const { data: existingCities, error: existingCitiesError } = await supabase
    .from("cities")
    .select("id, state_id, name, population, is_capital");
  if (existingCitiesError) throw existingCitiesError;
  const existingByKey = new Map(existingCities.map((c) => [`${c.state_id}:${c.name}`, c]));
  const existingCityById = new Map(existingCities.map((c) => [c.id, c]));

  // Snapshotted BEFORE the capital_city_id-clearing/cities-delete steps below — those mutate
  // `states`/`cities` as part of this same run, so fetching this AFTER them (an earlier version
  // of this script did) would compare "after" against "after" and report every state as changed
  // on every run, even a genuine no-op rerun (caught live).
  const { data: existingStates, error: existingStatesError } = await supabase
    .from("states")
    .select("id, name, population, region, flag_url, capital_city_id");
  if (existingStatesError) throw existingStatesError;
  const existingStateById = new Map(existingStates.map((s) => [s.id, s]));

  // A full delete-then-insert per successfully-fetched state, not an upsert-and-diff-cleanup —
  // `cities` no longer needs to preserve any row across runs for a foreign key's sake (sports_teams
  // dropped its city_id FK entirely in the same migration that removed Wikidata from this
  // pipeline), so there's no "stale but still needed" case left to reconcile. A state whose fetch
  // failed is left completely untouched (its existing rows neither deleted nor replaced).
  const cityRows = [];
  const deleteStateIds = [];
  for (const r of results) {
    if (r.failed) continue;
    deleteStateIds.push(r.abbr);
    for (const city of r.cities) {
      const key = `${r.abbr}:${city.name}`;
      const previous = existingByKey.get(key);
      if (!previous) changeLog.record("new city", `${r.abbr}: ${city.name}`);
      else if (previous.population !== city.population || previous.is_capital !== city.isCapital) {
        changeLog.record("updated city", `${r.abbr}: ${city.name}`);
      } else changeLog.record("unchanged city");
      cityRows.push({
        state_id: r.abbr,
        name: city.name,
        population: city.population,
        is_capital: city.isCapital,
      });
    }
  }
  for (const c of existingCities) {
    if (deleteStateIds.includes(c.state_id) && !cityRows.some((r) => r.state_id === c.state_id && r.name === c.name)) {
      changeLog.record("removed city", `${c.state_id}: ${c.name}`);
    }
  }

  if (deleteStateIds.length > 0) {
    // Break states.capital_city_id's FK into the rows about to be deleted first — otherwise a
    // state whose capital city id survives to be re-linked below would briefly dangle, and one
    // whose capital comes back with a different row (a genuine name/rank change) would fail the
    // delete outright.
    const { error: clearCapitalsError } = await supabase
      .from("states")
      .update({ capital_city_id: null })
      .in("id", deleteStateIds);
    if (clearCapitalsError) throw clearCapitalsError;
    const { error: deleteError } = await supabase.from("cities").delete().in("state_id", deleteStateIds);
    if (deleteError) throw deleteError;
  }

  const { data: insertedCities, error: insertError } = await supabase
    .from("cities")
    .insert(cityRows)
    .select("id, state_id, name, is_capital");
  if (insertError) throw insertError;
  const capitalCityIdByAbbr = new Map(
    insertedCities.filter((c) => c.is_capital).map((c) => [c.state_id, c.id]),
  );

  // `cities` is deleted-and-reinserted every run (see above), so `capital_city_id` gets a fresh
  // uuid on every single run even when the underlying capital city is unchanged — comparing the
  // raw id would make every state look "updated" every run, defeating the point of this change
  // log (caught live: a rerun with genuinely zero real changes still reported all 51 states
  // updated). Compares the capital's NAME instead, resolved from the pre-mutation snapshots
  // (`existingStateById`/`existingCityById`) fetched above, before this run touched anything.
  const capitalNameByAbbr = new Map(
    [...capitalCityIdByAbbr.keys()].map((abbr) => [abbr, cityRows.find((c) => c.state_id === abbr && c.is_capital)?.name]),
  );

  const stateUpdates = [];
  for (const r of results) {
    if (r.failed) continue;
    const previous = existingStateById.get(r.abbr);
    const previousCapitalName = previous?.capital_city_id
      ? existingCityById.get(previous.capital_city_id)?.name
      : null;
    const row = {
      id: r.abbr,
      name: previous?.name ?? r.abbr,
      population: r.population,
      region: regions[r.abbr] ?? null,
      flag_url: flagUrl(r.abbr),
      capital_city_id: capitalCityIdByAbbr.get(r.abbr) ?? null,
    };
    if (
      previous &&
      previous.population === row.population &&
      previous.region === row.region &&
      previous.flag_url === row.flag_url &&
      previousCapitalName === capitalNameByAbbr.get(r.abbr)
    ) {
      changeLog.record("unchanged state");
    } else changeLog.record("updated state", r.abbr);
    stateUpdates.push(row);
  }
  const { error: statesUpsertError } = await supabase.from("states").upsert(stateUpdates, { onConflict: "id" });
  if (statesUpsertError) throw statesUpsertError;

  await logSync(supabase, {
    source: "World Population Review (state facts + top-10 cities)",
    startedAt,
    error: null,
    warnings,
    job: "geography",
  });

  console.log(`Synced geography facts for ${stateUpdates.length} states, ${cityRows.length} cities — ${changeLog.summary()}.`);
  if (warnings.length > 0) {
    console.log(`${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
