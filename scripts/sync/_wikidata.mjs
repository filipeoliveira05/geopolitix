// Shared Wikidata SPARQL client for sync scripts — extracted from
// governor-history.mjs once geography.mjs needed the identical capability
// (retry/backoff against the same flaky query service). Behavior for the
// extracted functions is unchanged from what governor-history.mjs had
// inline; same precedent as this project's other shared sync helpers
// (_wikipedia.mjs, _supabase-admin.mjs, _change-log.mjs).
import { USER_AGENT } from "./_wikipedia.mjs";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 502/504 in addition to 429/503 — the query service (unlike the plain
// wbsearchentities API) genuinely returned a 502 under load during a real
// full-run test, a known WDQS gotcha for large/slow queries, not just
// theoretical.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

// No timeout at all let a hung connection block a run indefinitely with
// zero progress and zero error. AbortSignal.timeout() turns that into a
// retryable error instead.
const FETCH_TIMEOUT_MS = 30_000;

export async function fetchJson(url, headers = {}, attempt = 1) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...headers },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (attempt <= 5) {
      await sleep(3000 * attempt);
      return fetchJson(url, headers, attempt + 1);
    }
    throw err;
  }
  if (RETRYABLE_STATUSES.has(res.status) && attempt <= 5) {
    await sleep(3000 * attempt);
    return fetchJson(url, headers, attempt + 1);
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText} (${url})`);
  const text = await res.text();
  if (!text) {
    if (attempt <= 5) {
      await sleep(3000 * attempt);
      return fetchJson(url, headers, attempt + 1);
    }
    throw new Error(`Empty response after ${attempt} attempts (${url})`);
  }
  return JSON.parse(text);
}

export async function sparql(query) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, { Accept: "application/sparql-results+json" });
  return data.results.bindings;
}

/** Bare "Q123" from a full "http://www.wikidata.org/entity/Q123" URI. */
export function qidFromUri(uri) {
  return uri.split("/").pop();
}

/** "2019-01-07T00:00:00Z" -> "2019-01-07", matching Postgres `date` columns. */
export function toDateOnly(isoString) {
  return isoString ? isoString.slice(0, 10) : null;
}

/** Splits an array into fixed-size chunks — batches SPARQL VALUES clauses
 * to avoid the query service timing out/502ing on very large ones. */
export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

/** Splits a WKT "Point(-122.4194 37.7749)" literal (P625's raw SPARQL
 * binding value) into { latitude, longitude } floats, or nulls if absent/
 * unparsed. */
export function parsePoint(wkt) {
  if (!wkt) return { latitude: null, longitude: null };
  const match = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt);
  if (!match) return { latitude: null, longitude: null };
  return { longitude: Number(match[1]), latitude: Number(match[2]) };
}

/**
 * Resolves a city's population/coordinates by exact name, scoped to a
 * specific state (its Wikidata QID, from geography.mjs's resolveStateQids())
 * — used when a sync script encounters a city not already covered by
 * geography.mjs's own top-10-by-population query for that state (e.g. a
 * sports team's home city outside that state's top 10, like Green Bay/WI).
 */
export async function lookupCityFacts(name, stateQid) {
  const escaped = name.replace(/"/g, '\\"');
  // Bounded city->county->state (2 hops via UNION), not `wdt:P131+`
  // (unbounded transitive) — same fix geography.mjs's fetchTopCities
  // needed after a real run showed P131+ can time out/502 (California
  // alone has 83,625 entities transitively P131-linked to it).
  //
  // `?city wdt:P1082 ?population` is a REQUIRED triple, not OPTIONAL — a
  // real disambiguation bug, caught live: "Green Bay" is genuinely
  // ambiguous on Wikidata (the city AND the actual bay/lake both carry
  // that exact label and both link into Wisconsin's P131 hierarchy), and
  // with no ORDER BY, an unconstrained LIMIT 1 non-deterministically
  // picked the bay (no population) over the city (population 107,395) on
  // a real test run. Requiring population effectively filters to
  // populated places only, since a geographic feature like a bay never
  // has one.
  // Matches an "en" OR "mul" label, not "en" alone — caught live: Tampa
  // (Buccaneers/Lightning) and Jacksonville (Jaguars) both have no "en"
  // rdfs:label at all despite being real cities with full English Wikipedia
  // articles, so an "en"-only exact match silently returned zero rows and
  // this function's null fallback let sports.mjs insert a population-less
  // duplicate `cities` row rather than the real, already-fetched one from
  // geography.mjs's own top-cities query. Same "mul" fallback
  // geography.mjs's fetchCandidateCities now uses.
  const query = `SELECT ?population ?coord WHERE {
  { ?city rdfs:label "${escaped}"@en } UNION { ?city rdfs:label "${escaped}"@mul }
  {
    ?city wdt:P131 wd:${stateQid} .
  } UNION {
    ?city wdt:P131 ?county .
    ?county wdt:P131 wd:${stateQid} .
  }
  ?city wdt:P1082 ?population .
  OPTIONAL { ?city wdt:P625 ?coord . }
} LIMIT 1`;
  const rows = await sparql(query);
  if (rows.length === 0) return null;
  const row = rows[0];
  const { latitude, longitude } = parsePoint(row.coord?.value);
  return {
    population: row.population ? Number(row.population.value) : null,
    latitude,
    longitude,
  };
}
