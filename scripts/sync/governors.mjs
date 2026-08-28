// Populates the Supabase `governors` table (plan §4) from the OpenStates
// API v3 (v3.openstates.org, plan §3) — requires a free account + API key,
// set as OPENSTATES_API_KEY. Run manually via `npm run sync:governors`.
//
// No dedicated governors endpoint — /people?org_classification=executive
// returns every state executive-branch official (Governor, Lt. Governor,
// Attorney General, Secretary of State, ...), filtered client-side to
// current_role.title === "Governor". Jurisdiction ids follow the standard
// OCD format (ocd-jurisdiction/country:us/state:<abbr>/government) — built
// directly rather than resolved via /jurisdictions, since we already know
// the abbr from our own states list.
//
// DC is excluded: OpenStates returns zero executive-branch results for it
// (DC has a Mayor, not a Governor — not a data gap, a real absence).
// Other states can genuinely be missing a Governor entry despite one
// existing (confirmed: California, New Jersey, Virginia, and others — a
// crowdsourced-data completeness gap, not a bug in this query). Logged as a
// gap, not treated as a sync failure, and not hand-patched here either —
// src/lib/governors-data.ts's getGovernor() falls back to the current-term
// row in `governor_terms` (synced from Wikidata by governor-history.mjs
// for every state regardless of OpenStates coverage) instead. An earlier
// version of this script hand-maintained a GOVERNOR_OVERRIDES map of
// hardcoded name/party literals for these gap states — removed once it was
// clear that data goes stale the moment one of those governors leaves
// office (confirmed live: NJ and VA both changed governors in Jan 2026,
// and Wikidata already had it right while a hardcoded map would not).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { supabaseAdmin, TRIGGERED_BY } from "./_supabase-admin.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fipsToAbbr = JSON.parse(
  readFileSync(path.join(root, "src", "data", "fips-to-abbr.json"), "utf-8"),
);
const STATE_ABBRS = Object.values(fipsToAbbr).filter((abbr) => abbr !== "DC");

const API_KEY = process.env.OPENSTATES_API_KEY;
const BASE_URL = "https://v3.openstates.org";

// OpenStates returns "Democratic"/"Republican" — the app's convention
// (from unitedstates/congress-legislators, already synced into
// `terms.party`) is "Democrat"/"Republican". Normalize here so
// src/lib/party-colors.ts's PARTY_COLORS lookup (keyed "Democrat") doesn't
// silently fall back to "no party data" grey for every Democrat governor.
function normalizeParty(party) {
  if (party === "Democratic") return "Democrat";
  // Minnesota's official state party name (Democratic-Farmer-Labor, from a
  // 1944 merger) — unitedstates/congress-legislators already normalizes
  // this to "Democrat" for MN's federal delegation, matching it here too.
  if (party === "Democratic-Farmer-Labor") return "Democrat";
  return party;
}

function jurisdictionId(abbr) {
  return `ocd-jurisdiction/country:us/state:${abbr.toLowerCase()}/government`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 502/503/504 alongside 429 — confirmed live a real run crashed the whole
// script on a single PA 502, losing all progress on the other 49 states
// it had already fetched (nothing gets written to Supabase until every
// state is done). The other sync scripts in this codebase already treat
// all four as retryable (see _wikipedia.mjs's RETRYABLE_STATUSES) for the
// same reason.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

async function fetchExecutives(abbr, attempt = 1) {
  const url = `${BASE_URL}/people?jurisdiction=${encodeURIComponent(jurisdictionId(abbr))}&org_classification=executive`;
  const res = await fetch(url, { headers: { "X-API-KEY": API_KEY } });
  if (RETRYABLE_STATUSES.has(res.status) && attempt <= 5) {
    await sleep(5000 * attempt);
    return fetchExecutives(abbr, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`OpenStates request failed for ${abbr}: ${res.status} ${res.statusText}`);
  }
  const { results } = await res.json();
  return results;
}

function buildGovernor(abbr, person) {
  return {
    // Strip the "ocd-person/" prefix — this id ends up in a URL path
    // segment (/governor/[id]), and OpenStates' raw id containing a "/"
    // breaks that route (caught via a real 404 in browser verification).
    id: person.id.replace(/^ocd-person\//, ""),
    first_name: person.given_name || null,
    last_name: person.family_name || null,
    photo_url: person.image || null,
    bio_summary: null,
    state_id: abbr,
    party: normalizeParty(person.party) || null,
    start_date: null,
    end_date: null,
  };
}

async function main() {
  if (!API_KEY) {
    throw new Error("Missing OPENSTATES_API_KEY (run with --env-file=.env.local)");
  }

  const governors = [];
  const gaps = [];

  // Sequential with a small delay — OpenStates' free tier allows ~10 req/sec,
  // 50 states in ~50 requests comfortably clears that without needing
  // concurrency limiting.
  for (const [i, abbr] of STATE_ABBRS.entries()) {
    const executives = await fetchExecutives(abbr);
    const governor = executives.find((p) => p.current_role?.title === "Governor");
    if (governor) {
      governors.push(buildGovernor(abbr, governor));
    } else {
      gaps.push(abbr);
    }
    console.log(`[${i + 1}/${STATE_ABBRS.length}] ${abbr}${governor ? "" : " (gap)"}`);
    await sleep(1000);
  }

  if (gaps.length > 0) {
    console.warn(
      `No Governor entry found for: ${gaps.join(", ")} — getGovernor() falls back to governor_terms for these (see governors-data.ts), not a sync failure.`,
    );
  }

  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();

  // Upsert in place (matches legislators.mjs's own pattern) rather than a
  // full delete-then-reinsert — governor_terms.governor_id carries a
  // foreign key onto governors.id (added by the governor_terms migration,
  // after this script's original delete-then-reinsert design), so
  // deleting a still-referenced row throws. Confirmed live: with
  // governor_id already linked for every state, the old delete-all
  // approach fails every run from here on. Upserting the fresh set by id
  // never needs to delete a continuing governor's row at all.
  let { error } = await supabase.from("governors").upsert(governors, { onConflict: "id" });

  // Remove governors no longer returned by OpenStates — the genuine
  // "departed officeholder" case the old delete-all was actually for.
  // Their old row can still be referenced by a stale governor_terms row
  // until governor-history.mjs (running right after this in the
  // pipeline) relinks governor_id to the new officeholder — that FK
  // conflict is expected and transient here, not a sync failure, so it's
  // logged as a warning rather than thrown.
  const staleWarnings = [];
  if (!error) {
    const freshIds = new Set(governors.map((g) => g.id));
    const { data: existing, error: existingError } = await supabase.from("governors").select("id");
    if (existingError) {
      error = existingError;
    } else {
      const staleIds = existing.map((r) => r.id).filter((id) => !freshIds.has(id));
      for (const id of staleIds) {
        const { error: deleteError } = await supabase.from("governors").delete().eq("id", id);
        if (deleteError) {
          staleWarnings.push(`could not remove departed governor ${id} — ${deleteError.message}`);
        }
      }
    }
  }

  // A gap isn't a sync failure (status stays "success") but is still worth
  // surfacing in sync_logs.error_message rather than only the console.
  const warningMessages = [
    ...(gaps.length > 0 ? [`No Governor entry for: ${gaps.join(", ")}`] : []),
    ...staleWarnings,
  ];
  if (staleWarnings.length > 0) {
    console.warn(`${staleWarnings.length} stale-governor warning(s):\n${staleWarnings.join("\n")}`);
  }
  await supabase.from("sync_logs").insert({
    source: `${BASE_URL}/people (org_classification=executive)`,
    triggered_by: TRIGGERED_BY,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: error ? "error" : "success",
    error_message: error?.message ?? (warningMessages.length > 0 ? warningMessages.join("; ") : null),
  });

  if (error) throw error;

  console.log(`Synced ${governors.length} governors (${gaps.length} gap(s)).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
