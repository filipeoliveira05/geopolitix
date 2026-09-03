// Populates the Supabase `governor_terms` table (plan §4) from Wikidata —
// OpenStates (the `governors` table's source) has no history endpoint, only
// current officeholders. Run manually via `npm run sync:governor-history`.
// No API key needed: Wikidata's public search API + SPARQL query service.
//
// Verified live (research spike, not guessed) against real Wikidata output
// for Texas, Wyoming, and Mississippi before writing this:
// - Full term history exists back to statehood for all three, modeled as a
//   dated "position held" (P39) statement per term.
// - A person's party (P102) statements aren't date-scoped to the specific
//   term being queried — a party-switcher (Rick Perry, John Connally, TX;
//   Joseph M. Carey, WY) shows up once per party they've EVER held, not
//   just the one active during a given term. Resolved client-side (see
//   resolveParty below) by matching a party statement's own P580/P582
//   qualifiers against the term's own dates, not in SPARQL.
// - Missing start/end dates are real and uneven across states (TX: 1/54
//   rows missing a start date; WY: 0/34; MS: 19/70) — not a fluke, don't
//   assume complete coverage. Rows missing both dates carry no orderable
//   info and are skipped (logged, not silently dropped).
// - The "Governor of <state>" position item isn't always the sole search
//   result — Wyoming also matches "Governor of Wyoming Territory" — must
//   pick the exact-label match, not blindly take the first result.
// - The query service returned one empty/failed response during the spike
//   under repeated querying — fetchJson below retries like the other sync
//   scripts' external-API calls do.
//
// GOVERNOR_HISTORY_SCOPE="current" (weekly, in politicians-sync.yml) narrows each
// state's sync down to just its current term row (plus that one person's
// party history) instead of the full statehood-to-now set — a term that
// ended in 1850 never changes, so rewriting all ~2,400 governor_terms rows
// every week for the sake of possibly one new officeholder is dead weight.
// The `fetchTerms` SPARQL query itself is still the full-history one (a
// second, current-only query shape wasn't worth the added risk for a
// query that isn't the expensive part) — only which rows get upserted and
// how many people party-history is fetched for narrows. Unset/"full"
// (default, manual `npm run sync:governor-history`) keeps today's
// behavior for an occasional full resync — Wikidata is crowdsourced and
// does get rare corrections to old records, so this is meant to stay
// available on demand, just off the weekly cadence.
// BACKFILL_SCOPE="recent" (bio backfill only) similarly limits itself to
// people with a current or ~4-year-recent term, the same cutoff and
// rationale as legislators.mjs's own BACKFILL_SCOPE.
import { supabaseAdmin, TRIGGERED_BY } from "./_supabase-admin.mjs";
import { createChangeLog } from "./_change-log.mjs";
import { fetchWikipediaSummary, mapWithConcurrency, withHardTimeout } from "./_wikipedia.mjs";
import { sparql, qidFromUri, toDateOnly, chunk, fetchJson } from "./_wikidata.mjs";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

// Not part of the _wikidata.mjs extraction (that file's retry logic has its
// own internal sleep) — this one throttles between per-state main() loop
// iterations, a concern local to this script.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findGovernorPositionQid(stateName) {
  const exactLabel = `Governor of ${stateName}`;
  const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(exactLabel)}&language=en&format=json&limit=5`;
  const data = await fetchJson(url);
  const exact = data.search.find((r) => r.label === exactLabel);
  if (exact) return exact.id;
  // No exact "Governor of <state>" label — fall back to the first result
  // that isn't an obviously-different historical predecessor office.
  const fallback = data.search.find((r) => !/territory|colony|colonial/i.test(r.label));
  return fallback?.id ?? null;
}

async function fetchTerms(positionQid) {
  // wdt:P31 wd:Q5 (instance of: human) — without it, Wikidata happily
  // returns any entity tagged with this P39 position, fictional or not.
  // Caught live: West Virginia's real governor history included "Ray
  // Sullivan," a fictional West Wing character whose Wikidata entry lists
  // an in-show "Governor of West Virginia (2002-2006)" position — no
  // Wikipedia sitelink either, since the character was never a real person
  // to backfill a bio for.
  const query = `SELECT ?person ?personLabel ?start ?end WHERE {
  ?person p:P39 ?statement .
  ?statement ps:P39 wd:${positionQid} .
  ?person wdt:P31 wd:Q5 .
  OPTIONAL { ?statement pq:P580 ?start . }
  OPTIONAL { ?statement pq:P582 ?end . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?start)`;
  const rows = await sparql(query);
  return rows.map((r) => ({
    personQid: qidFromUri(r.person.value),
    name: r.personLabel?.value ?? null,
    start: toDateOnly(r.start?.value),
    end: toDateOnly(r.end?.value),
  }));
}

// Batched — a long-history state (Connecticut, one of the original
// colonies) hit 60+ distinct governors in one VALUES clause during a real
// full-run test, which the query service answered with a 502. Smaller
// batches are cheap insurance against that, on top of fetchJson's retry.
async function fetchPartyHistory(personQids) {
  const byPerson = new Map();
  for (const batch of chunk(personQids, 25)) {
    const values = batch.map((q) => `wd:${q}`).join(" ");
    const query = `SELECT ?person ?partyLabel ?partyStart ?partyEnd WHERE {
  VALUES ?person { ${values} }
  ?person p:P102 ?ps .
  ?ps ps:P102 ?party .
  OPTIONAL { ?ps pq:P580 ?partyStart . }
  OPTIONAL { ?ps pq:P582 ?partyEnd . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
    const rows = await sparql(query);
    for (const r of rows) {
      const personQid = qidFromUri(r.person.value);
      const entry = {
        party: r.partyLabel?.value ?? null,
        start: toDateOnly(r.partyStart?.value),
        end: toDateOnly(r.partyEnd?.value),
      };
      const existing = byPerson.get(personQid);
      if (existing) existing.push(entry);
      else byPerson.set(personQid, [entry]);
    }
  }
  return byPerson;
}

// Same substring-match normalization as races-2026.mjs/governors.mjs —
// Wikidata mixes generic ("Democratic Party") and state-affiliate
// ("Texas Democratic Party") names for the same two parties.
function normalizeParty(party) {
  if (!party) return null;
  if (/democrat/i.test(party)) return "Democrat";
  if (/republican/i.test(party)) return "Republican";
  return party;
}

/**
 * Picks which party statement was active during a given term, since
 * Wikidata doesn't date-scope P102 (party) against P39 (position held) —
 * a party-switcher's every party shows up against every term otherwise.
 * Returns `ambiguous: true` when more than one statement plausibly applies,
 * so the caller can log it rather than silently guess.
 */
function resolveParty(partyStatements, termStart) {
  if (partyStatements.length === 0) return { party: null, ambiguous: false };
  if (partyStatements.length === 1) {
    return { party: normalizeParty(partyStatements[0].party), ambiguous: false };
  }

  const dated = partyStatements.filter((p) => p.start || p.end);
  const overlapping = dated.filter((p) => {
    if (!termStart) return false;
    const afterStart = !p.start || p.start <= termStart;
    const beforeEnd = !p.end || p.end >= termStart;
    return afterStart && beforeEnd;
  });
  if (overlapping.length === 1) return { party: normalizeParty(overlapping[0].party), ambiguous: false };
  if (overlapping.length > 1) {
    return { party: normalizeParty(overlapping[0].party), ambiguous: true };
  }

  const undated = partyStatements.filter((p) => !p.start && !p.end);
  if (undated.length === 1) return { party: normalizeParty(undated[0].party), ambiguous: false };

  return { party: null, ambiguous: true };
}

async function syncState(supabase, state, currentGovernorsByState, warnings, scope, changeLog) {
  const positionQid = await findGovernorPositionQid(state.name);
  if (!positionQid) {
    warnings.push(`${state.id}: no "Governor of ${state.name}" position found on Wikidata`);
    return 0;
  }

  const terms = await fetchTerms(positionQid);

  // The most recent term with no end date is the current officeholder —
  // matches how `terms.is_current`/`getSenateHistory()` treat an ongoing
  // Senate term.
  const currentTerm = terms.find((t) => !t.end && t.start) ?? null;

  // scope="current" only writes/party-resolves the one current term row —
  // the rest of `terms` (this state's full history) was still fetched
  // above (see the header comment on why that query itself isn't narrowed)
  // but is otherwise unused this run.
  const termsToProcess = scope === "current" ? (currentTerm ? [currentTerm] : []) : terms;
  const partyByPerson = await fetchPartyHistory([
    ...new Set(termsToProcess.map((t) => t.personQid)),
  ]);
  const currentGovernor = currentGovernorsByState.get(state.id);
  // A last-token-only comparison (e.g. "Grisham") false-negatives on a
  // multi-word surname — confirmed live: New Mexico's OpenStates
  // last_name is "Lujan Grisham", not just "Grisham", so it never matched
  // Wikidata's full name "Michelle Lujan Grisham" until this was fixed to
  // a suffix check against the whole surname instead of its last word.
  const wikidataFullName = currentTerm?.name?.trim().toLowerCase();
  const openStatesLastName = currentGovernor?.last_name.trim().toLowerCase();
  const namesMatch =
    !!currentTerm && !!currentGovernor && !!wikidataFullName?.endsWith(openStatesLastName ?? "");
  if (currentTerm && currentGovernor && !namesMatch) {
    warnings.push(
      `${state.id}: current governor name mismatch — Wikidata "${currentTerm.name}" vs governors table "${currentGovernor.first_name} ${currentGovernor.last_name}" (not linking governor_id)`,
    );
  }

  // Wikidata occasionally has a genuine duplicate P39 statement for the
  // same person/term (confirmed live: NJ's A. Harry Moore has two
  // identical 1938-01-18–1941-01-21 statements) — two rows sharing this
  // table's (state_id, wikidata_person_id, start_date) unique key in one
  // upsert batch makes Postgres reject the whole batch ("ON CONFLICT DO
  // UPDATE command cannot affect row a second time"), so de-dupe by that
  // key before upserting rather than let one bad statement fail the state.
  const seenKeys = new Set();
  const rows = [];
  for (const term of termsToProcess) {
    // No start AND no end carries no orderable information — skip rather
    // than clutter the History tab with an undateable row.
    if (!term.start && !term.end) continue;

    const key = `${term.personQid}|${term.start}`;
    if (seenKeys.has(key)) {
      warnings.push(`${state.id}: dropped duplicate term for ${term.name} (${term.start ?? "?"})`);
      continue;
    }
    seenKeys.add(key);

    const { party, ambiguous } = resolveParty(partyByPerson.get(term.personQid) ?? [], term.start);
    if (ambiguous) {
      warnings.push(`${state.id}: ambiguous party for ${term.name} (${term.start ?? "?"}–${term.end ?? "?"})`);
    }

    const isCurrent = term === currentTerm;
    const linkedGovernorId = isCurrent && namesMatch ? currentGovernor.id : null;

    rows.push({
      state_id: state.id,
      governor_id: linkedGovernorId,
      wikidata_person_id: term.personQid,
      name: term.name,
      party,
      start_date: term.start,
      end_date: term.end,
      is_current: isCurrent,
      // Powers /governor/[id]'s own per-row freshness note for a historical governor. Note
      // GOVERNOR_HISTORY_SCOPE=current (the weekly cadence) only rebuilds a state's CURRENT term
      // row each week — a genuinely historical (non-current) term's row only gets touched by a
      // full-historical manual resync, so this column will legitimately differ a lot between the
      // two, which is the whole point of moving off a single shared job-level timestamp.
      last_synced_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    // Fetched before the upsert so the log can distinguish a genuinely new
    // term (e.g. a new officeholder) from the same content simply getting
    // rewritten by this run, like every other row this state's history has
    // always had — the (state_id, wikidata_person_id, start_date) key
    // matches this table's own unique constraint.
    const { data: existingRows, error: existingError } = await supabase
      .from("governor_terms")
      .select("wikidata_person_id, start_date, end_date, name, party")
      .eq("state_id", state.id);
    if (existingError) throw new Error(`${state.id}: existing-rows fetch failed — ${existingError.message}`);
    const existingByKey = new Map(
      existingRows.map((r) => [`${r.wikidata_person_id}|${r.start_date}`, r]),
    );
    for (const row of rows) {
      const key = `${row.wikidata_person_id}|${row.start_date}`;
      const previous = existingByKey.get(key);
      if (!previous) {
        changeLog.record("new term", `${state.id}: ${row.name} (${row.start_date ?? "?"}–${row.end_date ?? "present"})`);
      } else if (previous.end_date !== row.end_date || previous.name !== row.name || previous.party !== row.party) {
        changeLog.record("updated term", `${state.id}: ${row.name} (${row.start_date ?? "?"})`);
      } else {
        changeLog.record("unchanged term");
      }
    }

    const { error } = await supabase
      .from("governor_terms")
      .upsert(rows, { onConflict: "state_id,wikidata_person_id,start_date" });
    if (error) throw new Error(`${state.id}: upsert failed — ${error.message}`);
  }

  return rows.length;
}

// Wikidata's own P18 (image)/description are one option for backfilling
// /governor/[id] profile data for historical governors, but the Wikipedia
// REST API's page-summary endpoint (fetchWikipediaSummary, _wikipedia.mjs)
// gives a real one-paragraph bio *and* a photo thumbnail in one call —
// confirmed live to read noticeably better than Wikidata's terse one-line
// description (e.g. "American politician (1812-1883)"), and it's the same
// style of API races-2026.mjs already uses. Needs the actual enwiki
// article title, not a guess from `name` — confirmed live that guessing
// breaks on disambiguated titles (Wikidata Q542663's "Edward Clark" is
// actually "Edward_Clark_(governor)").
async function fetchSitelinkTitles(personQids) {
  const titleByPerson = new Map();
  const batches = chunk(personQids, 25);
  for (const [i, batch] of batches.entries()) {
    if (i > 0 && i % 20 === 0) console.log(`  sitelink batch ${i}/${batches.length}`);
    const values = batch.map((q) => `wd:${q}`).join(" ");
    const query = `SELECT ?person ?article WHERE {
  VALUES ?person { ${values} }
  OPTIONAL {
    ?article schema:about ?person ;
             schema:isPartOf <https://en.wikipedia.org/> .
  }
}`;
    const rows = await sparql(query);
    for (const r of rows) {
      if (!r.article) continue;
      const personQid = qidFromUri(r.person.value);
      const title = decodeURIComponent(r.article.value.replace("https://en.wikipedia.org/wiki/", ""));
      titleByPerson.set(personQid, title);
    }
  }
  return titleByPerson;
}

/**
 * Copies bio_summary/photo_url from each state's current-term governor_terms
 * row onto the matching governors.id row, unconditionally overwriting. A
 * current officeholder's own data (governors table, from OpenStates) has no
 * bio at all (governors.mjs hardcodes bio_summary: null) and only ~76%
 * photo coverage — confirmed live all 50 states' current-term rows already
 * carry a real bio+photo from backfillBios() above, so this is a plain
 * same-process copy, not a new fetch. Every governor_id on a current-term
 * row was confirmed live to match a real governors.id (including Vermont's
 * "manual-override-vt-governor"), so no join ever comes up empty.
 */
async function copyCurrentBiosToGovernors(supabase, warnings) {
  const { data: currentTerms, error: selectError } = await supabase
    .from("governor_terms")
    .select("governor_id, bio_summary, photo_url, wikipedia_title, wikipedia_verified, wikipedia_checked_no")
    .eq("is_current", true)
    .not("governor_id", "is", null);
  if (selectError) throw selectError;

  let updated = 0;
  for (const term of currentTerms) {
    const { error: updateError } = await supabase
      .from("governors")
      .update({
        bio_summary: term.bio_summary,
        photo_url: term.photo_url,
        wikipedia_title: term.wikipedia_title,
        wikipedia_verified: term.wikipedia_verified,
        wikipedia_checked_no: term.wikipedia_checked_no,
        // This is the only place a current governor's bio/photo actually gets written (OpenStates
        // itself never provides them — see governors.mjs's own header comment) — same reasoning
        // as candidates.last_synced_at needing a stamp on its bio-backfill update, not just its
        // name/party-matching one.
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", term.governor_id);
    if (updateError) {
      warnings.push(`copy current bio: update failed for ${term.governor_id} — ${updateError.message}`);
      continue;
    }
    updated++;
  }
  return updated;
}

/**
 * Backfills photo_url/bio_summary for every distinct person already synced
 * into governor_terms, from the Wikipedia REST API — run as a second pass
 * after all states' term rows exist, so it only ever fetches each real
 * person once regardless of how many terms/states they appear under.
 */
// Wikidata's SPARQL label service falls back to emitting the bare entity
// id (e.g. "Q651820") as if it were the label when a person genuinely has
// no rdfs:label in any fallback language — confirmed live via Wikidata's
// own raw entity JSON: Bill Owens (CO governor 1999-2007) has `labels.en:
// null` despite a full, real Wikipedia article. Not a fetch glitch, a real
// (if rare) gap in Wikidata itself — 3 of 2,288 people hit this.
const BARE_QID_PATTERN = /^Q\d+$/;

/** "Bill_Owens_(Colorado_politician)" -> "Bill Owens" */
function cleanNameFromTitle(title) {
  return title.replace(/_/g, " ").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// PostgREST caps a single select() at 1000 rows by default — governor_terms
// has ~2,400, so this needs the same pagination legislators.mjs's
// selectAllPages uses.
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

// How far back BACKFILL_SCOPE=recent reaches — same window and rationale
// as legislators.mjs's RECENT_YEARS.
const RECENT_YEARS = 4;

/** wikidata_person_id set for anyone with a current or ~recent term. */
async function fetchRecentPersonIds(supabase) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RECENT_YEARS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const rows = await selectAllPages(() =>
    supabase
      .from("governor_terms")
      .select("wikidata_person_id")
      .or(`end_date.is.null,end_date.gte.${cutoffDate}`),
  );
  return new Set(rows.map((r) => r.wikidata_person_id));
}

async function backfillBios(supabase, warnings, changeLog, { scope = "full" } = {}) {
  // Two separate criteria for "still needs work", merged: missing a bio
  // (filters on bio_summary, not photo_url — confirmed live that ~32
  // people legitimately have no Wikipedia thumbnail but do have a real
  // extract, and filtering on photo_url would re-select and re-fetch them
  // forever), OR a name that's really just the bare Wikidata id (self-heals
  // this on every future run, not just a one-off manual fix, in case more
  // cases turn up later).
  const { data: missingBio, error: missingBioError } = await supabase
    .from("governor_terms")
    .select("wikidata_person_id, name")
    .is("bio_summary", null);
  if (missingBioError) throw missingBioError;

  const { data: badName, error: badNameError } = await supabase
    .from("governor_terms")
    .select("wikidata_person_id, name")
    .filter("name", "match", "^Q[0-9]+$");
  if (badNameError) throw badNameError;

  let people = [...new Map([...missingBio, ...badName].map((r) => [r.wikidata_person_id, r.name])).entries()];
  if (scope === "recent") {
    const recentIds = await fetchRecentPersonIds(supabase);
    people = people.filter(([qid]) => recentIds.has(qid));
  }
  if (people.length === 0) return 0;
  console.log(`Backfilling ${people.length} people — resolving Wikipedia article titles...`);

  const titleByPerson = await fetchSitelinkTitles(people.map(([qid]) => qid));
  console.log(`Resolved ${titleByPerson.size}/${people.length} article titles — fetching summaries...`);

  let updated = 0;
  let processed = 0;
  // Concurrency 8, then 3, both still produced sustained 429s from
  // Wikipedia's REST API across ~900+ people in real runs (confirmed: 66
  // failures even at concurrency 3 with an 8-attempt retry budget) —
  // dialed back further to 2. A single person's fetch failing (after its
  // own retries) is logged and skipped rather than allowed to crash the
  // entire backfill; re-running the script only re-attempts whoever is
  // still missing photo_url/bio_summary, so this converges over reruns.
  await mapWithConcurrency(people, 2, async ([qid, name]) => {
    const title = titleByPerson.get(qid);
    if (!title) {
      warnings.push(`bio backfill: no Wikipedia article found for ${name} (${qid})`);
      changeLog.record("no wikipedia article", name);
      processed++;
      return;
    }
    let photoUrl;
    let bioSummary;
    try {
      // Same hard-timeout backstop as legislators.mjs's own bio backfill —
      // an AbortSignal.timeout() alone isn't a guaranteed ceiling (see
      // withHardTimeout's comment in _wikipedia.mjs), and this call's
      // retry loop needs an active cancel, not just an abandoned await, to
      // avoid leaving zombie retries running in the background.
      ({ photoUrl, bioSummary } = await withHardTimeout(
        (signal) => fetchWikipediaSummary(title, signal),
        90_000,
        `bio backfill (${qid})`,
      ));
    } catch (err) {
      warnings.push(`bio backfill: fetch failed for ${name} (${qid}) — ${err.message}`);
      changeLog.record("fetch failed", name);
      processed++;
      return;
    }
    const updates = {
      photo_url: photoUrl,
      bio_summary: bioSummary,
      last_synced_at: new Date().toISOString(),
    };
    if (BARE_QID_PATTERN.test(name)) updates.name = cleanNameFromTitle(title);
    const { error: updateError } = await supabase
      .from("governor_terms")
      .update(updates)
      .eq("wikidata_person_id", qid);
    if (updateError) {
      warnings.push(`bio backfill: update failed for ${name} (${qid}) — ${updateError.message}`);
      changeLog.record("update failed", name);
      processed++;
      return;
    }
    updated++;
    changeLog.record(photoUrl ? "backfilled (bio+photo)" : "backfilled (bio only)", name);
    processed++;
    if (processed % 100 === 0) console.log(`  ${processed}/${people.length} processed`);
  });

  return updated;
}

const SCOPE = process.env.GOVERNOR_HISTORY_SCOPE === "current" ? "current" : "full";
const BACKFILL_SCOPE = process.env.BACKFILL_SCOPE === "recent" ? "recent" : "full";

async function main() {
  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();

  const { data: states, error: statesError } = await supabase
    .from("states")
    .select("id, name")
    .neq("id", "DC"); // DC has a Mayor, not a Governor — same exclusion as governors.mjs.
  if (statesError) throw statesError;

  const { data: governors, error: governorsError } = await supabase
    .from("governors")
    .select("id, state_id, first_name, last_name");
  if (governorsError) throw governorsError;
  const currentGovernorsByState = new Map(governors.map((g) => [g.state_id, g]));

  const warnings = [];
  let totalRows = 0;
  let bioCount = 0;
  let currentCopyCount = 0;
  let error = null;
  const termsChangeLog = createChangeLog();
  const bioChangeLog = createChangeLog();

  try {
    for (const [i, state] of states.entries()) {
      // Per-state progress — everything else (warnings, the final summary)
      // only prints once the whole run finishes, so a slow or stuck run
      // was otherwise silent for its entire duration with no way to tell
      // which state or phase it was on.
      const startedState = Date.now();
      const count = await syncState(
        supabase,
        state,
        currentGovernorsByState,
        warnings,
        SCOPE,
        termsChangeLog,
      );
      totalRows += count;
      console.log(`[${i + 1}/${states.length}] ${state.id}: ${count} terms (${Date.now() - startedState}ms)`);
      // Courtesy pacing between states — no documented Wikidata rate limit,
      // but requests/state x 50 states deserves some restraint anyway.
      // Bumped from 500ms after a real GOVERNOR_HISTORY_SCOPE=current run
      // hit a 429 on the 21st state: scope="current" shrank each state's
      // own work (fetchPartyHistory now queries 1 person instead of a
      // whole state's history, and the upsert is 1 row instead of up to
      // 60+), so states finish faster and the same 500ms pacing produces a
      // tighter request rate against Wikidata than before — despite total
      // request volume actually going down. This restores headroom closer
      // to the original per-state pacing.
      await sleep(1500);
    }
    console.log("States done — backfilling photo/bio for every distinct person...");
    bioCount = await backfillBios(supabase, warnings, bioChangeLog, { scope: BACKFILL_SCOPE });
    console.log("Copying current-term bio/photo onto governors...");
    currentCopyCount = await copyCurrentBiosToGovernors(supabase, warnings);
  } catch (err) {
    error = err;
  }

  if (warnings.length > 0) {
    console.warn(`${warnings.length} warning(s):\n${warnings.join("\n")}`);
  }

  // Warnings (a missing position item, an ambiguous party, a name mismatch)
  // aren't sync failures — status stays "success" — but are still worth
  // surfacing in sync_logs.error_message, same as governors.mjs's own
  // "gap isn't a failure" logging. logSync ties status to whether `error`
  // is truthy, so a real failure still needs its own call.
  await supabase.from("sync_logs").insert({
    source: "wikidata.org (governor history)",
    job: "governor_history",
    triggered_by: TRIGGERED_BY,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: error ? "error" : "success",
    error_message: error?.message ?? (warnings.length > 0 ? warnings.join("; ") : null),
  });
  if (error) throw error;

  console.log(
    `Synced ${totalRows} governor terms across ${states.length} states (scope: ${SCOPE}) — ${termsChangeLog.summary()}. ` +
      `Backfilled bio/photo for ${bioCount} people (backfill scope: ${BACKFILL_SCOPE}) — ${bioChangeLog.summary()}. ` +
      `Copied current bio/photo onto ${currentCopyCount} governors (${warnings.length} warning(s)).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
