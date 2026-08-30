// Exports every candidate row that still needs a human look — no bio yet,
// and not already confirmed as "no Wikipedia page" by a prior manual
// review (wikipedia_checked_no) — in the same CSV shape
// ingest-candidate-csv.mjs expects (id,name,state,office,district,wikipedia_url,
// wikipedia_url left blank for the user to fill in with a URL or "no").
//
// Meant to be run periodically as new candidates appear (new primaries
// resolving in still-pending states) rather than as a one-time dump — the
// list should stay small after the initial backlog is cleared, since most
// candidates the automated exact-match search can safely resolve on its
// own (see races-2026.mjs's searchWikipediaTitle) never show up here at all.
//
// Usage: node scripts/sync/export-unreviewed-candidates.mjs > review.csv
import { config } from "dotenv";
config({ path: new URL("../../.env.local", import.meta.url) });
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } },
);

const { data: candidates, error } = await supabase
  .from("candidates")
  .select("id, name, state_id")
  .is("bio_summary", null)
  .eq("wikipedia_checked_no", false)
  .order("state_id")
  .order("name");
if (error) throw error;

// race_candidates carries office/district for display context in the CSV
// — best-effort lookup, not required for ingestion.
const { data: raceCandidates } = await supabase
  .from("race_candidates")
  .select("candidate_id, races_2026!race_candidates_race_id_fkey(office, district_number)")
  .in(
    "candidate_id",
    candidates.map((c) => c.id),
  );
const contextById = new Map(
  (raceCandidates ?? []).map((rc) => [rc.candidate_id, rc.races_2026]),
);

console.error(`${candidates.length} candidate(s) need review.`);

const csvEscape = (value) => {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

console.log("id,name,state,office,district,wikipedia_url");
for (const c of candidates) {
  const race = contextById.get(c.id);
  console.log(
    [
      c.id,
      csvEscape(c.name),
      c.state_id,
      race?.office ?? "",
      race?.district_number ?? "",
      "",
    ].join(","),
  );
}
