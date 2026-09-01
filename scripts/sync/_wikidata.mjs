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


