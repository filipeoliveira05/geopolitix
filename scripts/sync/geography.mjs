// Populates the Supabase `states` table's population/region/flag_url/
// capital_city_id and the `cities` table (plan §4, Phase 2) from Wikidata —
// no API key needed. Run manually via `npm run sync:geography`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { supabaseAdmin, logSync } from "./_supabase-admin.mjs";
import { createChangeLog } from "./_change-log.mjs";
import { mapWithConcurrency } from "./_wikipedia.mjs";
import { sparql, qidFromUri, chunk, parsePoint } from "./_wikidata.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const regions = JSON.parse(
  readFileSync(path.join(root, "src", "data", "state-regions.json"), "utf-8"),
);

// Washington, D.C. isn't `instance of` Q35657 (U.S. state) — it's a federal
// district — so its QID can't come from the same SPARQL filter every other
// state resolves through below. Hardcoded one-off, same class of gap as
// this app's other documented single-entity exceptions (e.g. governors.mjs's
// DC exclusion). Confirmed live: this QID's label resolves to "Washington,
// D.C." with a population figure in the ~670,000 range (see main()'s printed
// DC label check on every run).
const DC_QID = "Q61";

/**
 * All 50 states + DC's Wikidata QIDs, keyed by our `states.id` (2-letter
 * abbr) — resolved via ISO 3166-2 code (P300, e.g. "US-CA" -> "CA").
 * Exported for sports.mjs, which needs the identical state->QID mapping to
 * scope its own per-city Wikidata lookups.
 */
export async function resolveStateQids() {
  const query = `SELECT ?state ?iso WHERE {
  ?state wdt:P31 wd:Q35657 .
  ?state wdt:P300 ?iso .
}`;
  const rows = await sparql(query);
  const map = new Map();
  for (const row of rows) {
    const iso = row.iso.value; // e.g. "US-CA"
    if (!iso.startsWith("US-")) continue;
    map.set(iso.slice(3), qidFromUri(row.state.value));
  }
  map.set("DC", DC_QID);
  return map;
}

/**
 * Per-state population/flag/capital, batched via VALUES (same reasoning as
 * governor-history.mjs's fetchPartyHistory chunking — avoids the query
 * service 502ing on one huge VALUES clause). Multiple OPTIONALs can each
 * independently multiply a state's row count if a property ever has more
 * than one value — the merge below keeps the FIRST non-null value seen per
 * state per field, which is enough unless a real run surfaces a state with
 * genuinely conflicting duplicate values (if that happens, switch to
 * picking by P585 qualifier date the way governor-history.mjs's
 * resolveParty() does for a person's party history).
 */
async function fetchStateFacts(qids) {
  const byQid = new Map();
  for (const batch of chunk(qids, 25)) {
    const values = batch.map((q) => `wd:${q}`).join(" ");
    const query = `SELECT ?state ?stateLabel ?population ?flag ?capital ?capitalLabel WHERE {
  VALUES ?state { ${values} }
  OPTIONAL { ?state wdt:P1082 ?population . }
  OPTIONAL { ?state wdt:P41 ?flag . }
  OPTIONAL { ?state wdt:P36 ?capital . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
    const rows = await sparql(query);
    for (const row of rows) {
      const qid = qidFromUri(row.state.value);
      const existing = byQid.get(qid) ?? {};
      byQid.set(qid, {
        label: existing.label ?? row.stateLabel?.value ?? null,
        population: existing.population ?? (row.population ? Number(row.population.value) : null),
        flagUrl: existing.flagUrl ?? row.flag?.value ?? null,
        capitalQid: existing.capitalQid ?? (row.capital ? qidFromUri(row.capital.value) : null),
        capitalName: existing.capitalName ?? row.capitalLabel?.value ?? null,
      });
    }
  }
  return byQid;
}

/**
 * Every capital's own population/coordinates, fetched unconditionally
 * (regardless of whether that capital turns out to already be in its
 * state's own top-10-by-population list) — cheap (~51 QIDs, one batched
 * query) and avoids a second conditional fetch path later.
 */
async function fetchCapitalFacts(capitalQids) {
  const byQid = new Map();
  for (const batch of chunk(capitalQids, 25)) {
    const values = batch.map((q) => `wd:${q}`).join(" ");
    const query = `SELECT ?capital ?population ?coord WHERE {
  VALUES ?capital { ${values} }
  OPTIONAL { ?capital wdt:P1082 ?population . }
  OPTIONAL { ?capital wdt:P625 ?coord . }
}`;
    const rows = await sparql(query);
    for (const row of rows) {
      const qid = qidFromUri(row.capital.value);
      if (byQid.has(qid)) continue;
      const { latitude, longitude } = parsePoint(row.coord?.value);
      byQid.set(qid, {
        population: row.population ? Number(row.population.value) : null,
        latitude,
        longitude,
      });
    }
  }
  return byQid;
}

/**
 * A state's 10 most populous cities/towns — a real, multi-iteration spike
 * before landing on this shape (see the two functions below), because
 * Wikidata's US administrative-entity classification is genuinely messy in
 * ways that broke every simpler approach tried first:
 *
 * 1. `?city wdt:P131+ wd:${stateQid}` (unbounded transitive "located in")
 *    time out/502'd for a real state (California) during a live run —
 *    confirmed by isolating it: California alone has 83,625 entities
 *    transitively P131-linked to it (every neighborhood/precinct/district
 *    chains up eventually). Fixed by bounding to exactly city->county->
 *    state (2 hops, via UNION) — verified live against California (huge),
 *    Vermont (New England "town" form government), and Alaska (unusual
 *    borough structure) before trusting this shape.
 * 2. A curated allowlist of "real city" classes (`wd:Q1093829`/`wd:Q515`/
 *    etc.) worked for most states but missed Pennsylvania's largest city,
 *    Philadelphia — its actual classes are "consolidated city-county" and
 *    "city of Pennsylvania" (a PER-STATE class, "city of Texas"/"city of
 *    Ohio"/etc. would each need their own QID — not practical to
 *    enumerate for 50 states). Confirmed the same problem would recur
 *    state-by-state (PA/NJ both surfaced this live).
 * 3. Fetching the full 408-way `wdt:P31/wdt:P279* wd:Q515` subclass
 *    closure once and reusing it as a VALUES list still 502'd combined
 *    with the 2-hop UNION — too complex a query plan for WDQS.
 *
 * Landed on a two-stage, keyword-based approach instead: fetch a large
 * (100) population-ranked candidate pool with NO class filter at all
 * (fast, ~2-15s), then check only THOSE ~100 known entities' classes in a
 * second, bounded query (cheap, <1s, since it's a VALUES lookup over a
 * known small set, not a global closure) — keep a candidate only if ANY of
 * its classes' LABEL contains "city"/"town"/"village"/"municipality"/
 * "census-designated place"/"borough"/"township". A positive keyword
 * match on the class LABEL (not a QID allowlist, not an exclude-by-name
 * blocklist — both tried and abandoned live) generalizes correctly across
 * every real state-specific settlement class ("city of Pennsylvania",
 * "home rule municipality of Pennsylvania", "charter city", "consolidated
 * city-county" all contain "city"/"municipality") while naturally
 * rejecting the many aggregate/administrative types that otherwise
 * pollute a population-sorted candidate list (counties, metropolitan/
 * micropolitan/combined-statistical areas, congressional/state-legislative
 * districts, water districts, dioceses) — none of which happen to use
 * those words in their own class label. Verified live against California,
 * Pennsylvania, Vermont, and Alaska before trusting this.
 */
async function fetchCandidateCities(stateQid) {
  const query = `SELECT ?city ?cityLabel ?population ?coord WHERE {
  {
    ?city wdt:P131 wd:${stateQid} .
  } UNION {
    ?city wdt:P131 ?county .
    ?county wdt:P131 wd:${stateQid} .
  }
  ?city wdt:P1082 ?population .
  OPTIONAL { ?city wdt:P625 ?coord . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?population) LIMIT 100`;
  return sparql(query);
}

// Matches "city", "cities", "town", "village", "municipality", "census-
// designated place", "borough", "township" in a Wikidata class label —
// see fetchTopCities' header comment for why this beats a QID allowlist.
const SETTLEMENT_CLASS_PATTERN =
  /\b(cit(y|ies)|town|village|municipality|census-designated place|borough|township)\b/i;

async function filterToSettlementClasses(candidateQids) {
  const good = new Set();
  for (const batch of chunk(candidateQids, 100)) {
    const values = batch.map((q) => `wd:${q}`).join(" ");
    const query = `SELECT ?city ?classLabel WHERE {
  VALUES ?city { ${values} }
  ?city wdt:P31 ?class .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
    const rows = await sparql(query);
    for (const row of rows) {
      if (SETTLEMENT_CLASS_PATTERN.test(row.classLabel?.value ?? "")) {
        good.add(qidFromUri(row.city.value));
      }
    }
  }
  return good;
}

async function fetchTopCities(stateQid) {
  const candidates = await fetchCandidateCities(stateQid);
  const candidateQids = candidates.map((row) => qidFromUri(row.city.value));
  const settlementQids = await filterToSettlementClasses(candidateQids);

  const seenNames = new Set();
  const top = [];
  for (const row of candidates) {
    if (top.length >= 10) break;
    const qid = qidFromUri(row.city.value);
    if (!settlementQids.has(qid)) continue;
    const name = row.cityLabel.value;
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const { latitude, longitude } = parsePoint(row.coord?.value);
    top.push({ name, population: Number(row.population.value), latitude, longitude });
  }
  return top;
}

/** Top-10 cities + the capital (added if not already present), each tagged is_capital. */
function buildCitiesForState(topCities, capitalName, capitalFacts) {
  // Dedupe by name — caught live: a real run produced two rows for the
  // same city name in some states (Wikidata occasionally has more than one
  // P625 coordinate statement for one entity at slightly different
  // precision; `SELECT DISTINCT` operates on the whole result tuple, so
  // two rows differing only in `coord` both survive it even though they're
  // the same city). An undeduped duplicate name violates the
  // `(state_id, name)` unique constraint (Task 1) and fails the whole
  // batch upsert atomically — first-seen wins (highest population, since
  // fetchTopCities orders by DESC(?population)).
  const seen = new Set();
  const deduped = [];
  for (const c of topCities) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    deduped.push(c);
  }
  const cities = deduped.map((c) => ({ ...c, isCapital: c.name === capitalName }));
  if (capitalName && !cities.some((c) => c.isCapital)) {
    cities.push({
      name: capitalName,
      population: capitalFacts?.population ?? null,
      latitude: capitalFacts?.latitude ?? null,
      longitude: capitalFacts?.longitude ?? null,
      isCapital: true,
    });
  }
  return cities;
}

async function main() {
  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();
  const changeLog = createChangeLog();

  const stateQids = await resolveStateQids();
  console.log(`Resolved ${stateQids.size} state QIDs (DC: ${stateQids.get("DC")}).`);

  const facts = await fetchStateFacts([...stateQids.values()]);
  const dcFacts = facts.get(DC_QID);
  console.log(
    `DC label check: "${dcFacts?.label}" (population ${dcFacts?.population}) — confirm this reads "Washington, D.C." with population near 670,000.`,
  );

  const capitalQids = [...facts.values()].map((f) => f.capitalQid).filter(Boolean);
  const capitalFactsByQid = await fetchCapitalFacts(capitalQids);

  console.log(`Fetching top-10 cities for ${stateQids.size} states (concurrency 2)...`);
  // A single state's fetchTopCities failure must NOT abort the whole run —
  // caught live: California's own query 502'd after retries exhausted
  // (Wikidata's a big-state P131+ query for CA is genuinely heavy), which
  // crashed the entire batch and lost every other state's already-fetched
  // work, since nothing is upserted until this whole map completes. Same
  // class of mistake governors.mjs already learned from (a single unretried
  // PA 502 once lost all 50 states' progress there) — caught here via a
  // real run, not anticipated in advance. Falls back to capital-only for
  // that state (still correct, just missing the top-10 list) rather than
  // losing the other 50 states' results.
  const warnings = [];
  const citiesByAbbr = await mapWithConcurrency([...stateQids.entries()], 2, async ([abbr, qid]) => {
    const fact = facts.get(qid);
    // DC is a city, not a state with a capital — P36 ("capital") has no
    // value on Q61 itself (a state can't be its own capital), so
    // fetchTopCities' whole city->county->state search doesn't apply.
    // Bypassed entirely (not just "if it returns nothing") — caught live,
    // in two stages: first, DC produced 0 cities (nothing to add a
    // fallback for); after adding an empty-list fallback, a SECOND real
    // run showed fetchTopCities for DC actually returns 1 real but WRONG
    // result — "Logan Circle," a DC neighborhood matching the settlement
    // keyword filter — since the length-0 check no longer applied,
    // "Logan Circle" ended up wrongly stored as DC's only "city." DC's
    // own population is already resolved at the state level (`fact`), so
    // this reuses it directly instead of trusting a sub-city search that
    // doesn't have a real target to search for in DC's case.
    if (abbr === "DC") {
      const cities = [
        { name: "Washington", population: fact?.population ?? null, latitude: null, longitude: null, isCapital: true },
      ];
      console.log(`  ${abbr}: ${cities.length} cities`);
      return [abbr, cities];
    }
    let topCities;
    try {
      topCities = await fetchTopCities(qid);
    } catch (err) {
      warnings.push(`${abbr}: top-10 cities fetch failed — ${err.message}`);
      topCities = [];
    }
    const cities = buildCitiesForState(
      topCities,
      fact?.capitalName ?? null,
      capitalFactsByQid.get(fact?.capitalQid),
    );
    console.log(`  ${abbr}: ${cities.length} cities`);
    return [abbr, cities];
  }).then((entries) => new Map(entries));

  const { data: existingCities, error: existingCitiesError } = await supabase
    .from("cities")
    .select("id, state_id, name, population, is_capital, latitude, longitude");
  if (existingCitiesError) throw existingCitiesError;
  const existingCityByKey = new Map(existingCities.map((c) => [`${c.state_id}:${c.name}`, c]));

  const cityRows = [];
  for (const [abbr, cities] of citiesByAbbr) {
    for (const city of cities) {
      const key = `${abbr}:${city.name}`;
      const previous = existingCityByKey.get(key);
      const row = {
        state_id: abbr,
        name: city.name,
        population: city.population,
        is_capital: city.isCapital,
        latitude: city.latitude,
        longitude: city.longitude,
      };
      if (!previous) changeLog.record("new city", `${abbr}: ${city.name}`);
      else if (previous.population !== row.population || previous.is_capital !== row.is_capital) {
        changeLog.record("updated city", `${abbr}: ${city.name}`);
      } else changeLog.record("unchanged city");
      cityRows.push(row);
    }
  }

  const { data: upsertedCities, error: citiesUpsertError } = await supabase
    .from("cities")
    .upsert(cityRows, { onConflict: "state_id,name" })
    .select("id, state_id, name, is_capital");
  if (citiesUpsertError) throw citiesUpsertError;

  const capitalCityIdByAbbr = new Map(
    upsertedCities.filter((c) => c.is_capital).map((c) => [c.state_id, c.id]),
  );

  // `name` is included in every row's select AND upsert payload — caught
  // live: `states.name` is NOT NULL (seeded by states.mjs), and Postgres
  // rejects the WHOLE batch upsert if any proposed row is missing it, even
  // for rows that will resolve as an UPDATE via ON CONFLICT (Postgres
  // still has to construct the full candidate row, defaults and all,
  // before conflict resolution even runs). Prefers the already-seeded
  // name over Wikidata's own label to avoid drifting from states.mjs's
  // us-atlas-sourced name for an existing row.
  const { data: existing, error: existingError } = await supabase
    .from("states")
    .select("id, name, population, region, flag_url, capital_city_id");
  if (existingError) throw existingError;
  const existingById = new Map(existing.map((s) => [s.id, s]));

  const updates = [];
  for (const [abbr, qid] of stateQids) {
    const fact = facts.get(qid);
    const region = regions[abbr] ?? null;
    const previous = existingById.get(abbr);
    const row = {
      id: abbr,
      name: previous?.name ?? fact?.label ?? abbr,
      population: fact?.population ?? null,
      region,
      flag_url: fact?.flagUrl ?? null,
      capital_city_id: capitalCityIdByAbbr.get(abbr) ?? null,
    };
    if (!previous) {
      changeLog.record("new", abbr);
    } else if (
      previous.population !== row.population ||
      previous.region !== row.region ||
      previous.flag_url !== row.flag_url ||
      previous.capital_city_id !== row.capital_city_id
    ) {
      changeLog.record("updated", abbr);
    } else {
      changeLog.record("unchanged");
    }
    updates.push(row);
  }

  const { error } = await supabase.from("states").upsert(updates, { onConflict: "id" });
  await logSync(supabase, {
    source: "Wikidata (state population/region/flag/cities)",
    startedAt,
    error,
    warnings,
    job: "geography",
  });
  if (error) throw error;

  console.log(
    `Synced geography facts for ${updates.length} states, ${cityRows.length} cities — ${changeLog.summary()}.`,
  );
  if (warnings.length > 0) {
    console.log(`${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ${w}`);
  }
}

// Guarded so importing resolveStateQids() from sports.mjs doesn't also
// trigger this script's own full sync as a side effect of the import —
// caught live: an unguarded top-level main() call ran a full geography
// sync (and burned real Wikidata/API calls, tripping a Wikipedia rate
// limit) the moment sports.mjs merely imported this file for one function.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
