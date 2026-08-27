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
import { supabaseAdmin, TRIGGERED_BY } from "./_supabase-admin.mjs";

const USER_AGENT =
  "geopolitix-sync/1.0 (personal educational project; github.com/filipeoliveira05/geopolitix)";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 502/504 in addition to 429/503 — the query service (unlike the plain
// wbsearchentities API) genuinely returned a 502 under load during a real
// full-run test here, a known WDQS gotcha for large/slow queries, not just
// theoretical.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

async function fetchJson(url, headers = {}, attempt = 1) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, ...headers } });
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

async function sparql(query) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, { Accept: "application/sparql-results+json" });
  return data.results.bindings;
}

/** Bare "Q123" from a full "http://www.wikidata.org/entity/Q123" URI. */
function qidFromUri(uri) {
  return uri.split("/").pop();
}

/** "2019-01-07T00:00:00Z" -> "2019-01-07", matching Postgres `date` columns. */
function toDateOnly(isoString) {
  return isoString ? isoString.slice(0, 10) : null;
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
  const query = `SELECT ?person ?personLabel ?start ?end WHERE {
  ?person p:P39 ?statement .
  ?statement ps:P39 wd:${positionQid} .
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

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
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

async function syncState(supabase, state, currentGovernorsByState, warnings) {
  const positionQid = await findGovernorPositionQid(state.name);
  if (!positionQid) {
    warnings.push(`${state.id}: no "Governor of ${state.name}" position found on Wikidata`);
    return 0;
  }

  const terms = await fetchTerms(positionQid);
  const partyByPerson = await fetchPartyHistory([...new Set(terms.map((t) => t.personQid))]);

  // The most recent term with no end date is the current officeholder —
  // matches how `terms.is_current`/`getSenateHistory()` treat an ongoing
  // Senate term.
  const currentTerm = terms.find((t) => !t.end && t.start) ?? null;
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
  for (const term of terms) {
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
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("governor_terms")
      .upsert(rows, { onConflict: "state_id,wikidata_person_id,start_date" });
    if (error) throw new Error(`${state.id}: upsert failed — ${error.message}`);
  }

  return rows.length;
}

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
  let error = null;

  try {
    for (const state of states) {
      const count = await syncState(supabase, state, currentGovernorsByState, warnings);
      totalRows += count;
      // Courtesy pacing between states — no documented Wikidata rate limit,
      // but 3 requests/state x 50 states deserves some restraint anyway.
      await sleep(500);
    }
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
    triggered_by: TRIGGERED_BY,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: error ? "error" : "success",
    error_message: error?.message ?? (warnings.length > 0 ? warnings.join("; ") : null),
  });
  if (error) throw error;

  console.log(`Synced ${totalRows} governor terms across ${states.length} states (${warnings.length} warning(s)).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
