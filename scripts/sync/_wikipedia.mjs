// Shared Wikipedia REST helpers for sync scripts that backfill a
// photo_url/bio_summary pair from a known Wikipedia article title —
// governor-history.mjs (resolved via Wikidata sitelinks) and
// legislators.mjs (title comes straight from congress-legislators' own
// `id.wikipedia` field, no Wikidata lookup needed). Extracted here once a
// second consumer needed the exact same fetch/retry/concurrency behavior,
// proven live against ~2,288 people in governor-history.mjs's original run.
export const USER_AGENT =
  "geopolitix-sync/1.0 (personal educational project; github.com/filipeoliveira05/geopolitix)";

const WIKIPEDIA_SUMMARY_API = "https://en.wikipedia.org/api/rest_v1/page/summary";

// 502/504 in addition to 429/503 — seen for real against Wikimedia
// endpoints under load in this project's other sync scripts.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

// No timeout at all let a hung connection block a run indefinitely with
// zero progress and zero error — hit for real in governor-history.mjs (a
// run sat with 0 new log lines and flat CPU time for 40+ minutes before
// being killed by hand). AbortSignal.timeout() turns that into a
// retryable error instead.
const FETCH_TIMEOUT_MS = 30_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// withHardTimeout went through two broken versions before this one:
// v1 raced the caller's promise against a timer but never cancelled the
// original work when the timer won, so abandoned retry chains (each up to
// 8 attempts) piled up in the background and progressively stalled later
// items — confirmed via a real run whose throughput degraded after the
// first ~20-40 people. v2 dropped the race entirely in favor of passing an
// AbortSignal for `fn` to observe — but a caller that doesn't actually
// thread the signal through (the legislators.mjs update() call site, which
// discarded it) got ZERO timeout protection at all, since nothing was
// racing the timer against fn's promise anymore; confirmed by a real run
// stalling with 0 open sockets for 14+ minutes on what should have been a
// 90s ceiling. This version does both: Promise.race guarantees the outer
// await settles by `ms` regardless of whether `fn` honors the signal, AND
// `fn` still receives the signal so a fetch()-based `fn` can actively
// cancel its in-flight request rather than just being abandoned.
export async function withHardTimeout(fn, ms, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`hard timeout: ${label}`)), ms);
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error(`hard timeout: ${label}`)));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWikipediaSummary(title, signal, attempt = 1) {
  if (signal.aborted) throw signal.reason ?? new Error("aborted");
  const url = `${WIKIPEDIA_SUMMARY_API}/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  // A higher retry ceiling than most fetchers — this endpoint genuinely hit
  // real 429s under sustained concurrent load across thousands of requests
  // in governor-history.mjs, so it needs more room to back off and recover
  // rather than give up early. Bounded overall by the caller's withHardTimeout
  // signal, which can cut this short before maxAttempts is reached.
  const maxAttempts = 8;
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
    });
  } catch (err) {
    if (signal.aborted) throw signal.reason ?? err;
    if (attempt <= maxAttempts) {
      await sleep(2000 * attempt);
      return fetchWikipediaSummary(title, signal, attempt + 1);
    }
    throw err;
  }
  if (res.status === 404) return { photoUrl: null, bioSummary: null };
  if (RETRYABLE_STATUSES.has(res.status) && attempt <= maxAttempts) {
    await sleep(2000 * attempt);
    return fetchWikipediaSummary(title, signal, attempt + 1);
  }
  if (!res.ok) throw new Error(`Wikipedia summary failed: ${res.status} ${res.statusText} (${title})`);
  const data = await res.json();
  return {
    photoUrl: data.thumbnail?.source ?? null,
    bioSummary: data.extract ?? null,
  };
}

/**
 * A short concurrency pool — many distinct people, one Wikipedia REST call
 * each, would take too long fully sequential and is unnecessary load fully
 * parallel. `limit` concurrent in-flight requests at a time.
 *
 * Concurrency 8, then 3, both still produced sustained 429s from
 * Wikipedia's REST API across ~900+ people in governor-history.mjs's real
 * runs (confirmed: 66 failures even at concurrency 3 with an 8-attempt
 * retry budget) — dialed back to 2 there and reused here.
 *
 * `shouldStop`, if given, is checked before starting each new item — lets a
 * caller run this as a bounded-duration job (e.g. a frequent scheduled
 * GitHub Actions run rather than an always-on local process) that stops
 * picking up new work past a time budget while letting in-flight items
 * finish, instead of running for however long the full backlog takes.
 */
export async function mapWithConcurrency(items, limit, fn, { shouldStop } = {}) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length && !shouldStop?.()) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
