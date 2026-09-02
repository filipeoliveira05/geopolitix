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

// Per-row ceiling for backfillLogoAndBio's two withHardTimeout calls (main summary fetch + infobox
// fallback) — 90s, not 30s, since fetchWikipediaSummary's own internal retry (8 attempts,
// 2000ms*attempt backoff) can legitimately need up to ~72s to ride out sustained 429 pressure late
// in a large run. Matches legislators.mjs's own bio-backfill hard-timeout, which hit this identical
// problem first.
const BACKFILL_HARD_TIMEOUT_MS = 90_000;

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

const MEDIAWIKI_API = "https://en.wikipedia.org/w/api.php";

/** Same retry/backoff shape as fetchWikipediaSummary, generalized for the plain MediaWiki
 * action API (used by fetchInfoboxLogoUrl below) rather than the REST summary endpoint. */
async function fetchMediaWikiApiJson(params, attempt = 1) {
  const url = `${MEDIAWIKI_API}?${new URLSearchParams({ ...params, format: "json" })}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (attempt <= 5) {
      await sleep(2000 * attempt);
      return fetchMediaWikiApiJson(params, attempt + 1);
    }
    throw err;
  }
  if (RETRYABLE_STATUSES.has(res.status) && attempt <= 5) {
    await sleep(2000 * attempt);
    return fetchMediaWikiApiJson(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`MediaWiki API request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// Matches the infobox parameter that actually holds a team/program's logo filename — confirmed
// live to vary by infobox template, not a single universal name: {{Infobox NFL team}}/
// {{Infobox MLB}}/{{Infobox basketball club}}/college basketball's {{Infobox CBB Team}} all use
// `logo`; {{Infobox football club}} (MLS/NWSL) and {{Infobox college football team}} use `image`/
// `Image`; {{Infobox NHL team}} uses `logo_image`. Anchored so a same-prefixed-but-different field
// (e.g. `imagesize`/`logo_size`, a pixel width, not a filename) can't match — the key must be
// followed immediately by `=` (whitespace aside).
const INFOBOX_IMAGE_PARAM = /^\s*\|\s*(?:logo|logo_image|image)\s*=\s*(.+?)\s*$/im;

/** Cleans an infobox image parameter's raw value down to a bare filename — handles a plain
 * "Team logo.svg", a wikilinked "[[File:Team logo.svg|200px]]", a "File:"/"Image:" prefix, and an
 * inline HTML comment trailing the filename (confirmed live: Boston College Eagles men's
 * basketball's `logo` value is "Boston College Eagles wordmark.svg <!-- Please do not remove...
 * -->", a real Wikipedia editorial convention warning against removing non-free logo files —
 * left unstripped, the comment text got treated as part of the filename and the file lookup
 * silently failed, making a real logo look like another "genuinely missing" case). */
function cleanInfoboxFilename(raw) {
  let value = raw.replace(/<!--.*?-->/g, "").trim();
  const wikilink = /^\[\[(.+)\]\]$/.exec(value);
  if (wikilink) value = wikilink[1];
  value = value.split("|")[0].trim();
  value = value.replace(/^(File|Image):/i, "").trim();
  return value || null;
}

/** Resolves a bare filename (no "File:" prefix) to its real upload.wikimedia.org URL. */
async function resolveInfoboxFileUrl(filename) {
  const data = await fetchMediaWikiApiJson({
    action: "query",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "url",
  });
  const page = Object.values(data.query?.pages ?? {})[0];
  return page?.imageinfo?.[0]?.url ?? null;
}

/**
 * Fallback logo source for when fetchWikipediaSummary's REST thumbnail comes back empty despite
 * the article existing — confirmed live (Binghamton Bearcats men's basketball) that this is a
 * real, demonstrable gap in the REST endpoint's own PageImages-derived thumbnail, not evidence the
 * team/program genuinely has no logo: Binghamton's real infobox logo is a 1050x197px wordmark,
 * and MediaWiki's PageImages heuristic (which powers that thumbnail field) systematically misses
 * this shape of image, even though the file itself is real and the infobox references it directly.
 * Parses the article's own lead-section wikitext for its infobox's logo/image parameter (see
 * INFOBOX_IMAGE_PARAM above) and resolves that filename to a real URL directly, bypassing
 * PageImages' heuristic entirely. Returns null (not a throw) for a page with no matching
 * parameter or an unresolvable filename — same "we tried, this one genuinely has nothing usable"
 * semantics as fetchWikipediaSummary's own null thumbnail, just after actually checking the
 * infobox instead of trusting a heuristic that can miss it.
 */
export async function fetchInfoboxLogoUrl(title) {
  const data = await fetchMediaWikiApiJson({
    action: "parse",
    page: title,
    prop: "wikitext",
    section: "0",
  });
  const wikitext = data.parse?.wikitext?.["*"];
  if (!wikitext) return null;
  const match = INFOBOX_IMAGE_PARAM.exec(wikitext);
  if (!match) return null;
  const filename = cleanInfoboxFilename(match[1]);
  if (!filename) return null;
  return resolveInfoboxFileUrl(filename);
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

/**
 * Backfills `row.logo_url`/`row.bio_summary` (mutated in place) from each row's
 * `wikipedia_title`, shared by sports.mjs/college-football.mjs/college-basketball.mjs. The primary
 * source is the Wikipedia REST summary's thumbnail — a direct lookup against an already-resolved
 * article title, not a search, so unlike the candidates table's name-search bio matching (real
 * wrong-person risk documented elsewhere) it carries no wrong-image risk. When that thumbnail comes
 * back empty despite the article resolving (bioSummary present), falls back to fetchInfoboxLogoUrl
 * — see that function's own comment for why the REST thumbnail alone under-counts real logos
 * (confirmed live via Binghamton Bearcats men's basketball: a real, existing 1050x197px wordmark
 * logo that PageImages' heuristic simply never surfaces). Even with that fallback, a small residual
 * null rate is expected and real — some smaller college basketball programs' articles genuinely
 * have no infobox image at all — same class of gap as the ~30 governors with no photo elsewhere in
 * this app, not a bug to chase. `bioSummary` (the same REST fetch's text extract, added for the
 * individual team/program pages) rides along for free — no extra request beyond the one fallback
 * lookup. Callers should only pass rows that actually need fetching (a new row, or an existing one
 * with no bio_summary/a changed wikipedia_title) — these populations are small enough (low hundreds
 * each) to backfill inline during every sync run rather than needing legislators.mjs's
 * BACKFILL_BUDGET_MS splitting, but re-fetching data this sync already has would still be pure
 * waste. Same concurrency-2 ceiling and hard-timeout wrapping every other Wikipedia REST consumer
 * in this codebase already needed against real sustained 429s.
 */
export async function backfillLogoAndBio(rows, changeLog, labelFor) {
  await mapWithConcurrency(rows, 2, async (row) => {
    try {
      const { photoUrl, bioSummary } = await withHardTimeout(
        (signal) => fetchWikipediaSummary(row.wikipedia_title, signal),
        BACKFILL_HARD_TIMEOUT_MS,
        `logo/bio fetch (${labelFor(row)})`,
      );
      let logoUrl = photoUrl;
      let fallbackUsed = false;
      if (!logoUrl && bioSummary) {
        logoUrl = await withHardTimeout(
          () => fetchInfoboxLogoUrl(row.wikipedia_title),
          BACKFILL_HARD_TIMEOUT_MS,
          `infobox logo fetch (${labelFor(row)})`,
        ).catch(() => null);
        fallbackUsed = logoUrl !== null;
      }
      row.logo_url = logoUrl;
      row.bio_summary = bioSummary;
      changeLog.record(
        logoUrl ? (fallbackUsed ? "logo/bio fetched (infobox fallback)" : "logo/bio fetched") : "no logo/bio on Wikipedia",
        labelFor(row),
      );
    } catch (err) {
      row.logo_url = null;
      row.bio_summary = null;
      changeLog.record("logo/bio fetch failed", `${labelFor(row)} — ${err.message}`);
    }
  });
}
