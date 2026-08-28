// Populates the Supabase `legislators`/`terms` tables (plan §4) from the
// `unitedstates/congress-legislators` public dataset
// (github.com/unitedstates/congress-legislators) — no API key needed. Run
// manually via `npm run sync:legislators`; requires `scripts/sync/states.mjs`
// to have run first (terms.state_id is a FK into `states`).
//
// Two source files:
// - legislators-current.yaml: currently serving members, each with their full term
//   history (all chambers) — kept in full, since the "Current representation" tab
//   needs current House terms too.
// - legislators-historical.yaml: former members (huge — ~9MB, every House member
//   back to 1789). Kept in full (all chambers) to power both the Senate and House
//   "history over time" tabs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { supabaseAdmin, logSync } from "./_supabase-admin.mjs";
import {
  USER_AGENT,
  fetchWikipediaSummary,
  mapWithConcurrency,
  withHardTimeout,
} from "./_wikipedia.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Same 50 states + DC as src/lib/states.ts's getAllStates() (Census TIGER
// scope, no territories) — the `states` table is seeded from the same set
// (scripts/sync/states.mjs), so territorial delegates (PR, VI, GU, AS, MP)
// have no state_id to satisfy the terms FK. The app doesn't support
// territories elsewhere (no map polygon, not in getAllStates()) either.
const VALID_STATE_IDS = new Set(
  Object.values(
    JSON.parse(readFileSync(path.join(root, "src", "data", "fips-to-abbr.json"), "utf-8")),
  ),
);

const BASE_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main";
const CURRENT_URL = `${BASE_URL}/legislators-current.yaml`;
const HISTORICAL_URL = `${BASE_URL}/legislators-historical.yaml`;

function photoUrl(bioguideId) {
  return `https://unitedstates.github.io/images/congress/450x550/${bioguideId}.jpg`;
}

function chamberFor(termType) {
  if (termType === "sen") return "senate";
  if (termType === "rep") return "house";
  throw new Error(`Unknown term type: ${termType}`);
}

// PostgREST caps a single select() at 1000 rows by default — with ~12,700
// legislators, an unpaginated select silently returns only the first
// 1000. Paginates via .range() until a page comes back short of the page
// size. `buildQuery` must return a fresh query builder each call (a
// builder already awaited once can't safely be re-ranged and re-awaited).
async function selectAllPages(buildQuery) {
  const PAGE_SIZE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchYaml(url) {
  console.log(`Fetching ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return loadYaml(await res.text());
}

function buildLegislator(person) {
  const bioguideId = person.id?.bioguide;
  if (!bioguideId) return null; // every member has one; skip malformed entries defensively
  return {
    id: bioguideId,
    bioguide_id: bioguideId,
    govtrack_id: person.id?.govtrack ? String(person.id.govtrack) : null,
    first_name: person.name?.first ?? null,
    last_name: person.name?.last ?? null,
    photo_url: photoUrl(bioguideId),
    birthday: person.bio?.birthday ?? null,
  };
}

function buildTerms(bioguideId, rawTerms, today, { onlySenate }) {
  return rawTerms
    .filter((term) => (!onlySenate || term.type === "sen") && VALID_STATE_IDS.has(term.state))
    .map((term) => ({
      legislator_id: bioguideId,
      chamber: chamberFor(term.type),
      state_id: term.state,
      district_number: term.type === "rep" ? (term.district ?? 0) : null,
      party: term.party ?? null,
      start_date: term.start,
      end_date: term.end,
      is_current: term.start <= today && today <= term.end,
    }));
}

// unitedstates/images has no coverage before photography existed —
// confirmed live 404 for all three House members whose terms started on
// the very first day of Congress, 1789-03-04. A plain HEAD check against
// the predictable photo_url decides, per legislator, whether to fall back
// to Wikipedia's own thumbnail instead of guessing an era cutoff.
async function checkPhotoExists(url, signal) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Backfills bio_summary (always) and photo_url (only when the existing
 * unitedstates/images photo 404s) for every legislator still missing a
 * bio — a second pass after the main upsert, run in the same process so
 * it reuses the Wikipedia article titles already loaded from the YAML
 * rather than re-deriving them. Filters on bio_summary alone (not photo)
 * so a legislator with a real bio but no Wikipedia thumbnail — and no
 * working unitedstates/images photo either — isn't re-fetched forever;
 * same accepted tradeoff as governor-history.mjs's backfillBios().
 */
async function backfillLegislatorBios(supabase, wikipediaTitleByBioguideId, warnings, { budgetMs } = {}) {
  const people = await selectAllPages(() =>
    supabase.from("legislators").select("id, photo_url").is("bio_summary", null),
  );
  if (people.length === 0) return 0;

  console.log(`Backfilling ${people.length} legislators' bios/photos...`);

  let updated = 0;
  let processed = 0;
  // Logs on every path (success AND failure) via recordProcessed, not just
  // success — every-item failures (e.g. a sustained outage) would otherwise
  // never print a single progress line no matter how long the run went,
  // since the old code only checked the modulo on the success branch.
  function recordProcessed() {
    processed++;
    if (processed % 10 === 0) console.log(`  ${processed}/${people.length} processed`);
  }
  // Wikipedia's real rate limit is generous for a well-identified client —
  // the actual bottleneck confirmed live is a huge population (~12,700)
  // against a deliberately low concurrency, which realistically takes
  // multiple days to fully converge. budgetMs (set by the frequent
  // GitHub Actions schedule, unset for a manual/local full run) stops
  // picking up NEW work past a wall-clock deadline rather than running
  // for however long the whole backlog takes — the next scheduled run
  // resumes via the same bio_summary IS NULL filter.
  const deadline = budgetMs ? Date.now() + budgetMs : undefined;
  const shouldStop = deadline ? () => Date.now() > deadline : undefined;
  // Concurrency 2 — the same ceiling governor-history.mjs's real runs
  // converged on after sustained 429s from this same Wikipedia REST API at
  // concurrency 3+, and this run is a larger population (~12,700 vs.
  // ~2,288), so there's no reason to expect more headroom here.
  await mapWithConcurrency(
    people,
    2,
    async (person) => {
      const title = wikipediaTitleByBioguideId.get(person.id);
      if (!title) {
        warnings.push(`bio backfill: no Wikipedia title for ${person.id}`);
        recordProcessed();
        return;
      }
      let bioSummary;
      let photoUrl;
      let photoOk;
      try {
        // Outer backstop on top of fetchWikipediaSummary's/checkPhotoExists'
        // own timeouts — a real run hung indefinitely on the very first item
        // despite both already having AbortSignal timeouts (see
        // withHardTimeout's comment in _wikipedia.mjs). Deliberately shorter
        // than the ~5.5min worst-case legitimate full retry chain would
        // need — with ~12,700 people, letting every stuck item run its full
        // retry budget risks a run measured in many hours; a person who
        // times out here just stays bio_summary-null and gets picked up
        // again on the next rerun (same idempotent filter as everyone else
        // still missing one), so a short ceiling trades a few extra reruns
        // for bounded total runtime.
        [{ bioSummary, photoUrl }, photoOk] = await withHardTimeout(
          (signal) =>
            Promise.all([
              fetchWikipediaSummary(title, signal),
              checkPhotoExists(person.photo_url, signal),
            ]),
          90_000,
          `bio backfill (${person.id})`,
        );
      } catch (err) {
        // Logged immediately (not just batched into the end-of-run warnings
        // summary) so a run stuck on repeated hard timeouts is visible in
        // real time rather than silent until completion.
        console.warn(`  bio backfill: fetch failed for ${person.id} — ${err.message}`);
        warnings.push(`bio backfill: fetch failed for ${person.id} — ${err.message}`);
        recordProcessed();
        return;
      }
      const updates = { bio_summary: bioSummary };
      if (!photoOk && photoUrl) updates.photo_url = photoUrl;
      // A single one-shot call (no internal retry loop to leave running in
      // the background), so an ordinary race — no signal to thread through,
      // supabase-js doesn't need or accept one here — is enough of a backstop.
      const { error: updateError } = await withHardTimeout(
        () => supabase.from("legislators").update(updates).eq("id", person.id),
        30_000,
        `bio backfill update (${person.id})`,
      ).catch((err) => ({ error: err }));
      if (updateError) {
        warnings.push(`bio backfill: update failed for ${person.id} — ${updateError.message}`);
        recordProcessed();
        return;
      }
      updated++;
      recordProcessed();
    },
    { shouldStop },
  );

  if (shouldStop?.()) {
    console.log(
      `  time budget reached — ${processed}/${people.length} attempted this run, remainder resumes next run.`,
    );
  }

  return updated;
}

// Set by the frequent bio-backfill-only GitHub Actions schedule (see
// .github/workflows/legislator-bio-backfill.yml) — the weekly full sync
// (sync.yml) leaves both unset. Skips the legislators/terms upsert
// entirely (the YAML is still fetched — cheap, a few seconds — since the
// Wikipedia title map comes from it regardless) so a run every few hours
// doesn't repeatedly churn the 45k-row terms table for no reason; only
// existing legislators (already inserted by the last full sync) can be
// backfilled this way. BACKFILL_BUDGET_MS bounds how long the backfill
// pass keeps picking up new people before stopping cleanly — see
// backfillLegislatorBios's own comment on why this run can't just
// process the whole backlog in one sitting.
const BACKFILL_ONLY = process.env.LEGISLATORS_BACKFILL_ONLY === "true";
const BACKFILL_BUDGET_MS = process.env.BACKFILL_BUDGET_MS
  ? Number(process.env.BACKFILL_BUDGET_MS)
  : undefined;

async function main() {
  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();

  const [current, historical] = await Promise.all([
    fetchYaml(CURRENT_URL),
    fetchYaml(HISTORICAL_URL),
  ]);

  // backfillLegislatorBios (below) may have already replaced a legislator's
  // photo_url with a Wikipedia thumbnail on a prior run, once the
  // unitedstates/images guess proved to 404 for them. Without this, every
  // rerun of this script would silently stomp that fix straight back to
  // the (still-404) guessed URL, since buildLegislator's guess is always
  // present in the upsert payload. Not needed at all in backfill-only mode
  // since that mode never upserts legislators.
  const existingPhotoById = BACKFILL_ONLY
    ? new Map()
    : new Map(
        (await selectAllPages(() => supabase.from("legislators").select("id, photo_url"))).map(
          (r) => [r.id, r.photo_url],
        ),
      );

  const today = new Date().toISOString().slice(0, 10);
  const legislators = [];
  const terms = [];
  const seenIds = new Set();
  // Captured here (not re-fetched) for backfillLegislatorBios below — the
  // congress-legislators YAML already carries the enwiki article title
  // directly (`id.wikipedia`, ~100% coverage, confirmed live), so unlike
  // governor-history.mjs there's no separate Wikidata lookup step needed.
  const wikipediaTitleByBioguideId = new Map();

  function keepExistingOrGuessedPhoto(legislator) {
    const guessed = legislator.photo_url;
    const existing = existingPhotoById.get(legislator.id);
    legislator.photo_url = existing && existing !== guessed ? existing : guessed;
  }

  for (const person of current) {
    const legislator = buildLegislator(person);
    if (!legislator || seenIds.has(legislator.id)) continue;
    seenIds.add(legislator.id);
    if (!BACKFILL_ONLY) {
      keepExistingOrGuessedPhoto(legislator);
      legislators.push(legislator);
      terms.push(...buildTerms(legislator.id, person.terms ?? [], today, { onlySenate: false }));
    }
    if (person.id?.wikipedia) wikipediaTitleByBioguideId.set(legislator.id, person.id.wikipedia);
  }

  for (const person of historical) {
    const legislator = buildLegislator(person);
    if (!legislator || seenIds.has(legislator.id)) continue; // current takes precedence
    const historicalTerms = buildTerms(legislator.id, person.terms ?? [], today, {
      onlySenate: false,
    });
    if (!BACKFILL_ONLY) {
      if (historicalTerms.length === 0) continue;
      seenIds.add(legislator.id);
      keepExistingOrGuessedPhoto(legislator);
      legislators.push(legislator);
      terms.push(...historicalTerms);
    } else {
      seenIds.add(legislator.id);
    }
    if (person.id?.wikipedia) wikipediaTitleByBioguideId.set(legislator.id, person.id.wikipedia);
  }

  let error = null;

  if (!BACKFILL_ONLY) {
    const legislatorsResult = await supabase.from("legislators").upsert(legislators, {
      onConflict: "id",
    });
    error = legislatorsResult.error;

    // terms has no natural stable key to upsert against across runs (unlike
    // legislators, keyed on bioguide_id) — this script owns the whole table's
    // contents, so a full resync clears it first rather than accumulating
    // duplicates. Chunked inserts because Supabase's REST endpoint rejects a
    // single request this large (tens of thousands of historical House + Senate
    // terms, plus current terms).
    if (!error) {
      ({ error } = await supabase.from("terms").delete().not("id", "is", null));
    }
    const CHUNK_SIZE = 1000;
    for (let i = 0; !error && i < terms.length; i += CHUNK_SIZE) {
      ({ error } = await supabase.from("terms").insert(terms.slice(i, i + CHUNK_SIZE)));
      console.log(`Inserted terms ${Math.min(i + CHUNK_SIZE, terms.length)}/${terms.length}`);
    }
  }

  const warnings = [];
  let bioCount = 0;
  if (!error) {
    try {
      bioCount = await backfillLegislatorBios(supabase, wikipediaTitleByBioguideId, warnings, {
        budgetMs: BACKFILL_BUDGET_MS,
      });
    } catch (err) {
      error = err;
    }
  }

  if (warnings.length > 0) {
    console.warn(`${warnings.length} bio backfill warning(s):\n${warnings.join("\n")}`);
  }

  await logSync(supabase, {
    source: `${CURRENT_URL}, ${HISTORICAL_URL}`,
    startedAt,
    error,
    warnings,
  });

  if (error) throw error;

  const syncedMessage = BACKFILL_ONLY
    ? "legislators/terms sync skipped (backfill-only mode)"
    : `Synced ${legislators.length} legislators / ${terms.length} terms`;
  console.log(
    `${syncedMessage}, backfilled bio/photo for ${bioCount} people (${warnings.length} warning(s)).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
