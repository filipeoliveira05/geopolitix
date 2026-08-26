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
// existing (confirmed: California) — a crowdsourced-data completeness gap,
// not a bug in this query. Logged as a gap, not treated as a sync failure.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { supabaseAdmin } from "./_supabase-admin.mjs";

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

// A handful of states OpenStates is known to be missing a Governor entry
// for despite one existing (plan §3) — hand-maintained, cheap at this
// scale. Re-check occasionally whether OpenStates has filled the gap on
// its own and drop the override once it's no longer needed.
function override(stateId, fullName, party, photoUrl = null) {
  const [first_name, ...rest] = fullName.split(" ");
  return {
    id: `manual-override/${stateId.toLowerCase()}-governor`,
    first_name,
    last_name: rest.join(" "),
    photo_url: photoUrl,
    bio_summary: null,
    state_id: stateId,
    party,
    start_date: null,
    end_date: null,
  };
}

const GOVERNOR_OVERRIDES = {
  CA: override("CA", "Gavin Newsom", "Democrat", "https://www.gov.ca.gov/wp-content/uploads/2019/01/Newsom-Portrait.jpg"),
  DE: override("DE", "Matt Meyer", "Democrat"),
  IN: override("IN", "Mike Braun", "Republican"),
  MO: override("MO", "Mike Kehoe", "Republican"),
  MT: override("MT", "Greg Gianforte", "Republican"),
  NH: override("NH", "Kelly Ayotte", "Republican"),
  NJ: override("NJ", "Mikie Sherrill", "Democrat"),
  NC: override("NC", "Josh Stein", "Democrat"),
  ND: override("ND", "Kelly Armstrong", "Republican"),
  UT: override("UT", "Spencer Cox", "Republican"),
  VT: override("VT", "Phil Scott", "Republican"),
  VA: override("VA", "Abigail Spanberger", "Democrat"),
};

function jurisdictionId(abbr) {
  return `ocd-jurisdiction/country:us/state:${abbr.toLowerCase()}/government`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchExecutives(abbr, attempt = 1) {
  const url = `${BASE_URL}/people?jurisdiction=${encodeURIComponent(jurisdictionId(abbr))}&org_classification=executive`;
  const res = await fetch(url, { headers: { "X-API-KEY": API_KEY } });
  if (res.status === 429 && attempt <= 5) {
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
    id: person.id,
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
  for (const abbr of STATE_ABBRS) {
    const executives = await fetchExecutives(abbr);
    const governor = executives.find((p) => p.current_role?.title === "Governor");
    if (governor) {
      governors.push(buildGovernor(abbr, governor));
    } else if (GOVERNOR_OVERRIDES[abbr]) {
      governors.push(GOVERNOR_OVERRIDES[abbr]);
    } else {
      gaps.push(abbr);
    }
    await sleep(1000);
  }

  if (gaps.length > 0) {
    console.warn(`No Governor entry found for: ${gaps.join(", ")} — add to GOVERNOR_OVERRIDES if this persists.`);
  }

  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();

  // Governors table only tracks the current officeholder per state (no
  // history) — full replace each run, same pattern as terms, so a
  // mid-term change is reflected cleanly instead of leaving a stale row.
  let { error } = await supabase.from("governors").delete().not("id", "is", null);
  if (!error) {
    ({ error } = await supabase.from("governors").insert(governors));
  }

  // A gap isn't a sync failure (status stays "success") but is still worth
  // surfacing in sync_logs.error_message rather than only the console.
  await supabase.from("sync_logs").insert({
    source: `${BASE_URL}/people (org_classification=executive)`,
    triggered_by: "manual",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: error ? "error" : "success",
    error_message:
      error?.message ?? (gaps.length > 0 ? `No Governor entry for: ${gaps.join(", ")}` : null),
  });

  if (error) throw error;

  console.log(`Synced ${governors.length} governors (${gaps.length} gap(s)).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
