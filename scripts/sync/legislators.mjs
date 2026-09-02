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
//
// LEGISLATORS_SCOPE controls which of the two files this run actually
// resyncs into `legislators`/`terms` — a 200-year-old term is never going
// to change, so rewriting all ~45k historical rows on the same weekly
// cadence as current members is dead weight, not safety. Values:
// - "current": fetches/upserts only legislators-current.yaml. The (small)
//   current file is still always fetched even in "historical" scope below,
//   purely to know which bioguide ids are current so a historical run
//   doesn't reprocess someone who's actually still serving ("current takes
//   precedence", unchanged from before this split).
// - "historical": fetches/upserts only legislators-historical.yaml. Meant
//   to be run rarely/manually (`npm run sync:legislators-historical`) —
//   congress-legislators is crowdsourced and does get occasional
//   corrections to old records, so this isn't wired to never run again,
//   just off the frequent cadence.
// - unset (default): both, unchanged from this script's original
//   behavior — used for an occasional one-off full resync.
// The `terms` cleanup delete (see main() below) is scoped to only the
// bioguide ids this run actually touched, so a "current"-scoped run can
// never sweep up (and delete) historical rows stamped by an earlier
// "historical" run, or vice versa.
//
// BACKFILL_SCOPE similarly limits which legislators the bio/photo backfill
// considers: "recent" restricts to current officeholders plus anyone whose
// most recent term ended within RECENT_YEARS years; unset (default. "all")
// considers every legislator with a null bio_summary, matching the
// pre-split behavior.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { supabaseAdmin, logSync } from "./_supabase-admin.mjs";
import { createChangeLog } from "./_change-log.mjs";
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

// How far back "recent" reaches for BACKFILL_SCOPE=recent — roughly one
// full Senate term / two House terms / one gubernatorial term, wide enough
// to catch stragglers from the last full election cycle without dragging
// in genuine history.
const RECENT_YEARS = 4;

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
    // Persisted (not re-derived from the YAML every run) so
    // backfillLegislatorBios can look it up straight from the row —
    // needed once LEGISLATORS_SCOPE=current stopped always fetching
    // legislators-historical.yaml (see the wikipedia_title migration).
    wikipedia_title: person.id?.wikipedia ?? null,
  };
}

function buildTerms(bioguideId, rawTerms, today, syncedAt, { onlySenate }) {
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
      last_synced_at: syncedAt,
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
 * Bioguide ids of anyone currently serving or whose most recent term ended
 * within RECENT_YEARS years — the population BACKFILL_SCOPE=recent limits
 * itself to. A separate query against `terms` rather than a join, since
 * postgrest-js has no cross-table filter for "this legislator's terms
 * include one matching X".
 */
async function fetchRecentLegislatorIds(supabase) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RECENT_YEARS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const rows = await selectAllPages(() =>
    supabase.from("terms").select("legislator_id").or(`end_date.is.null,end_date.gte.${cutoffDate}`),
  );
  return new Set(rows.map((r) => r.legislator_id));
}

/**
 * Backfills bio_summary (always) and photo_url (only when the existing
 * unitedstates/images photo 404s) for every legislator still missing a
 * bio — a second pass after the main upsert, run in the same process.
 * Reads the Wikipedia article title from the row's own wikipedia_title
 * column (persisted by buildLegislator on whichever run last upserted that
 * person) rather than an in-memory map built from this run's own YAML
 * fetch — required once LEGISLATORS_SCOPE=current stopped always fetching
 * legislators-historical.yaml, since BACKFILL_SCOPE=recent's population
 * includes recently-departed people a "current"-scoped run never parses.
 * Filters on bio_summary alone (not photo) so a legislator with a real bio
 * but no Wikipedia thumbnail — and no working unitedstates/images photo
 * either — isn't re-fetched forever; same accepted tradeoff as
 * governor-history.mjs's backfillBios().
 */
async function backfillLegislatorBios(supabase, warnings, changeLog, { budgetMs, scope = "all" } = {}) {
  let people = await selectAllPages(() =>
    supabase.from("legislators").select("id, photo_url, wikipedia_title").is("bio_summary", null),
  );
  if (scope === "recent") {
    const recentIds = await fetchRecentLegislatorIds(supabase);
    people = people.filter((p) => recentIds.has(p.id));
  }
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
      const title = person.wikipedia_title;
      if (!title) {
        warnings.push(`bio backfill: no Wikipedia title for ${person.id}`);
        changeLog.record("no wikipedia title", person.id);
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
        changeLog.record("fetch failed", person.id);
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
        changeLog.record("update failed", person.id);
        recordProcessed();
        return;
      }
      updated++;
      changeLog.record(
        updates.photo_url ? "backfilled (bio+photo)" : "backfilled (bio only)",
        person.id,
      );
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
// (politicians-sync.yml) leaves both unset. Skips the legislators/terms upsert
// entirely, and now (since wikipedia_title is a persisted column, not a
// map re-derived from this run's own YAML fetch) skips fetching either
// YAML file too — nothing in backfill-only mode needs them anymore — so a
// run every few hours doesn't repeatedly churn the 45k-row terms table,
// or spend time downloading legislators-historical.yaml, for no reason.
// Only existing legislators (already inserted by a prior current/historical
// sync) can be backfilled this way. BACKFILL_BUDGET_MS bounds how long the
// backfill pass keeps picking up new people before stopping cleanly — see
// backfillLegislatorBios's own comment on why this run can't just
// process the whole backlog in one sitting.
const BACKFILL_ONLY = process.env.LEGISLATORS_BACKFILL_ONLY === "true";
const BACKFILL_BUDGET_MS = process.env.BACKFILL_BUDGET_MS
  ? Number(process.env.BACKFILL_BUDGET_MS)
  : undefined;
const SCOPE = process.env.LEGISLATORS_SCOPE; // "current" | "historical" | undefined (both)
const BACKFILL_SCOPE = process.env.BACKFILL_SCOPE === "recent" ? "recent" : "all";
const processCurrent = SCOPE !== "historical";
const processHistorical = SCOPE !== "current";

async function main() {
  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();

  // Nothing in backfill-only mode reads current/historical below anymore
  // (wikipedia_title comes from the DB row, not this run's YAML fetch), so
  // both stay empty and neither file is fetched. Otherwise,
  // legislators-current.yaml is always fetched, even in "historical" scope
  // — it's small, and its bioguide ids are needed there purely for the
  // "current takes precedence" dedup below. legislators-historical.yaml
  // (~9MB) is skipped entirely in "current" scope.
  let current = [];
  let historical = [];
  if (!BACKFILL_ONLY) {
    [current, historical] = await Promise.all([
      fetchYaml(CURRENT_URL),
      processHistorical ? fetchYaml(HISTORICAL_URL) : Promise.resolve([]),
    ]);
  }
  const currentBioguideIds = new Set(
    current.map((p) => p.id?.bioguide).filter(Boolean),
  );

  // backfillLegislatorBios (below) may have already replaced a legislator's
  // photo_url with a Wikipedia thumbnail on a prior run, once the
  // unitedstates/images guess proved to 404 for them. Without this, every
  // rerun of this script would silently stomp that fix straight back to
  // the (still-404) guessed URL, since buildLegislator's guess is always
  // present in the upsert payload. Not needed at all in backfill-only mode
  // since that mode never upserts legislators.
  const existingById = BACKFILL_ONLY
    ? new Map()
    : new Map(
        (
          await selectAllPages(() =>
            supabase.from("legislators").select("id, photo_url, first_name, last_name"),
          )
        ).map((r) => [r.id, r]),
      );

  const today = new Date().toISOString().slice(0, 10);
  const legislators = [];
  const terms = [];
  const seenIds = new Set();
  const legislatorChangeLog = createChangeLog();

  function keepExistingOrGuessedPhoto(legislator) {
    const guessed = legislator.photo_url;
    const existing = existingById.get(legislator.id)?.photo_url;
    legislator.photo_url = existing && existing !== guessed ? existing : guessed;
  }

  function recordLegislatorChange(legislator) {
    const previous = existingById.get(legislator.id);
    if (!previous) {
      legislatorChangeLog.record("new", `${legislator.id}: ${legislator.first_name} ${legislator.last_name}`);
    } else if (previous.first_name !== legislator.first_name || previous.last_name !== legislator.last_name) {
      legislatorChangeLog.record(
        "renamed",
        `${legislator.id}: "${previous.first_name} ${previous.last_name}" -> "${legislator.first_name} ${legislator.last_name}"`,
      );
    } else {
      legislatorChangeLog.record("unchanged");
    }
  }

  // current/historical are empty arrays in BACKFILL_ONLY mode (see above),
  // so these loops naturally do nothing then — no need for their own
  // BACKFILL_ONLY branch.
  if (processCurrent) {
    for (const person of current) {
      const legislator = buildLegislator(person);
      if (!legislator || seenIds.has(legislator.id)) continue;
      seenIds.add(legislator.id);
      keepExistingOrGuessedPhoto(legislator);
      recordLegislatorChange(legislator);
      legislators.push(legislator);
      terms.push(
        ...buildTerms(legislator.id, person.terms ?? [], today, startedAt, { onlySenate: false }),
      );
    }
  }

  if (processHistorical) {
    for (const person of historical) {
      const legislator = buildLegislator(person);
      // current takes precedence — currentBioguideIds catches this even
      // when processCurrent is false (LEGISLATORS_SCOPE=historical), since
      // seenIds isn't populated by a current-file loop in that case.
      if (!legislator || currentBioguideIds.has(legislator.id) || seenIds.has(legislator.id)) continue;
      const historicalTerms = buildTerms(legislator.id, person.terms ?? [], today, startedAt, {
        onlySenate: false,
      });
      if (historicalTerms.length === 0) continue;
      seenIds.add(legislator.id);
      keepExistingOrGuessedPhoto(legislator);
      recordLegislatorChange(legislator);
      legislators.push(legislator);
      terms.push(...historicalTerms);
    }
  }

  let error = null;

  // Content-hash the fresh terms so the insert-then-cleanup below (which
  // always reinserts every in-scope term regardless of whether anything
  // changed) can still report how many are genuinely new content — a real
  // officeholder/term change — versus rows that already existed unchanged.
  // Fetched scoped to `seenIds` only (this run's own population), chunked
  // the same way the cleanup delete below already is.
  function termContentKey(t) {
    return `${t.legislator_id}|${t.chamber}|${t.state_id}|${t.district_number}|${t.party}|${t.start_date}|${t.end_date}`;
  }
  const termsChangeLog = createChangeLog();
  if (!BACKFILL_ONLY && terms.length > 0) {
    const existingTermKeys = new Set();
    const idsForExisting = [...seenIds];
    const SELECT_CHUNK_SIZE = 500;
    for (let i = 0; i < idsForExisting.length; i += SELECT_CHUNK_SIZE) {
      const idChunk = idsForExisting.slice(i, i + SELECT_CHUNK_SIZE);
      const rows = await selectAllPages(() =>
        supabase
          .from("terms")
          .select("legislator_id, chamber, state_id, district_number, party, start_date, end_date")
          .in("legislator_id", idChunk),
      );
      for (const row of rows) existingTermKeys.add(termContentKey(row));
    }
    for (const t of terms) {
      if (existingTermKeys.has(termContentKey(t))) termsChangeLog.record("unchanged");
      else {
        termsChangeLog.record(
          "new/changed",
          `${t.legislator_id}: ${t.chamber} ${t.state_id}${t.district_number ? `-${t.district_number}` : ""} (${t.start_date}–${t.end_date ?? "present"})`,
        );
      }
    }
  }

  if (!BACKFILL_ONLY) {
    const legislatorsResult = await supabase.from("legislators").upsert(legislators, {
      onConflict: "id",
    });
    error = legislatorsResult.error;

    // terms has no natural stable key to upsert against across runs (unlike
    // legislators, keyed on bioguide_id) — this script still owns the whole
    // table's contents, so a full resync fully replaces it each run, but
    // inserts the fresh set FIRST and only removes the previous run's rows
    // after, rather than the reverse. Confirmed live: delete-then-insert
    // left `terms` genuinely incomplete (not just stale) if any chunk
    // failed partway through — everything already deleted, only some
    // chunks re-inserted. Same reorder races_2026.mjs went through for the
    // same reason. Chunked inserts because Supabase's REST endpoint
    // rejects a single request this large (tens of thousands of
    // historical House + Senate terms, plus current terms).
    const CHUNK_SIZE = 1000;
    for (let i = 0; !error && i < terms.length; i += CHUNK_SIZE) {
      ({ error } = await supabase.from("terms").insert(terms.slice(i, i + CHUNK_SIZE)));
      console.log(`Inserted terms ${Math.min(i + CHUNK_SIZE, terms.length)}/${terms.length}`);
    }
    if (!error) {
      // Every fresh chunk above succeeded — remove the previous run's stale
      // rows, but ONLY for the legislator ids this run actually touched
      // (seenIds). A scoped run (LEGISLATORS_SCOPE=current/historical)
      // only ever inserts terms for its own population above — without
      // this id scoping, the blanket "any stale row" delete below would
      // also sweep up the OTHER scope's rows (e.g. a current-scoped run
      // deleting every historical term, since none of them got a fresh
      // last_synced_at stamp this run). `.is.null` still covers any
      // pre-existing row from before this column existed, for whichever
      // ids are in scope. Chunked (not one `.in()` with all ~12,700 ids)
      // since PostgREST's URL-encoded filter has a practical length limit.
      const idsToClean = [...seenIds];
      const CLEAN_CHUNK_SIZE = 500;
      for (let i = 0; !error && i < idsToClean.length; i += CLEAN_CHUNK_SIZE) {
        const idChunk = idsToClean.slice(i, i + CLEAN_CHUNK_SIZE);
        ({ error } = await supabase
          .from("terms")
          .delete()
          .in("legislator_id", idChunk)
          .or(`last_synced_at.lt.${startedAt},last_synced_at.is.null`));
      }
    } else {
      // Something failed partway through — roll back only the partial
      // chunks this run inserted (all stamped >= startedAt), so the
      // previous run's complete data is left exactly as it was rather
      // than mixed with an incomplete new set. The run still reports as
      // failed below.
      await supabase.from("terms").delete().gte("last_synced_at", startedAt);
    }
  }

  const warnings = [];
  let bioCount = 0;
  const bioChangeLog = createChangeLog();
  if (!error) {
    try {
      bioCount = await backfillLegislatorBios(supabase, warnings, bioChangeLog, {
        budgetMs: BACKFILL_BUDGET_MS,
        scope: BACKFILL_SCOPE,
      });
    } catch (err) {
      error = err;
    }
  }

  if (warnings.length > 0) {
    console.warn(`${warnings.length} bio backfill warning(s):\n${warnings.join("\n")}`);
  }

  await logSync(supabase, {
    source: BACKFILL_ONLY
      ? "legislators (bio backfill only, no YAML fetch)"
      : processHistorical
        ? `${CURRENT_URL}, ${HISTORICAL_URL}`
        : CURRENT_URL,
    startedAt,
    error,
    warnings,
    job: BACKFILL_ONLY ? "legislators_bio_backfill" : "legislators",
  });

  if (error) throw error;

  const syncedMessage = BACKFILL_ONLY
    ? "legislators/terms sync skipped (backfill-only mode)"
    : `Synced ${legislators.length} legislators (${legislatorChangeLog.summary()}) / ${terms.length} terms (${termsChangeLog.summary()}) (scope: ${SCOPE ?? "all"})`;
  console.log(
    `${syncedMessage}, backfilled bio/photo for ${bioCount} people — ${bioChangeLog.summary()} (${warnings.length} warning(s)).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
