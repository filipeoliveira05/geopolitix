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

async function main() {
  const [current, historical] = await Promise.all([
    fetchYaml(CURRENT_URL),
    fetchYaml(HISTORICAL_URL),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const legislators = [];
  const terms = [];
  const seenIds = new Set();

  for (const person of current) {
    const legislator = buildLegislator(person);
    if (!legislator || seenIds.has(legislator.id)) continue;
    seenIds.add(legislator.id);
    legislators.push(legislator);
    terms.push(...buildTerms(legislator.id, person.terms ?? [], today, { onlySenate: false }));
  }

  for (const person of historical) {
    const legislator = buildLegislator(person);
    if (!legislator || seenIds.has(legislator.id)) continue; // current takes precedence
    const historicalTerms = buildTerms(legislator.id, person.terms ?? [], today, {
      onlySenate: false,
    });
    if (historicalTerms.length === 0) continue;
    seenIds.add(legislator.id);
    legislators.push(legislator);
    terms.push(...historicalTerms);
  }

  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();
  let error = null;

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

  await logSync(supabase, {
    source: `${CURRENT_URL}, ${HISTORICAL_URL}`,
    startedAt,
    error,
  });

  if (error) throw error;

  console.log(`Synced ${legislators.length} legislators / ${terms.length} terms.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
