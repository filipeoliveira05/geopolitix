// Exports every candidate row that hasn't been through a human review yet
// — two different groups, both invisible to the app's automated pipeline
// in different ways:
//   - "no bio yet": no bio_summary, and not already confirmed as
//     "no Wikipedia page" (wikipedia_checked_no) by a prior review.
//   - "unverified auto-match": has a bio_summary from the automated
//     exact-match search, but nobody has confirmed it's actually the right
//     person — a real risk (see CLAUDE.md's Steve Cohen case), unlike
//     legislators/governors whose automated match is ID-based, not a name
//     search. wikipedia_url is pre-filled with the current guess so
//     reviewing is a quick click-and-confirm rather than a from-scratch
//     search — leave it as-is to confirm, replace it if it's wrong, or set
//     "no" if the guess is wrong and no real page exists.
//
// Same CSV shape ingest-candidate-csv.mjs expects
// (id,name,state,office,district,wikipedia_url) plus an extra `status`
// column (informational only, ignored by ingestion) so it's obvious at a
// glance which group each row came from.
//
// Meant to be run periodically, not as a one-time dump — after the initial
// backlog clears, most candidates the automated exact-match search can
// safely resolve on its own (see races-2026.mjs's searchWikipediaTitle)
// still need this one manual confirmation pass, but new ones only trickle
// in a few at a time as remaining primaries resolve.
//
// Usage: node scripts/sync/export-unreviewed-candidates.mjs > manual-review/candidates-YYYY-MM-DD-review.csv
// (manual-review/ is gitignored — a human's working notes and in-progress
// review state, not a project doc — but kept as a local backup trail, one
// dated file per review round rather than overwriting the same file.)
import { config } from "dotenv";
config({ path: new URL("../../.env.local", import.meta.url) });
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } },
);

function wikipediaUrl(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

const { data: noBio, error: noBioError } = await supabase
  .from("candidates")
  .select("id, name, state_id")
  .is("bio_summary", null)
  .eq("wikipedia_checked_no", false);
if (noBioError) throw noBioError;

const { data: unverified, error: unverifiedError } = await supabase
  .from("candidates")
  .select("id, name, state_id, wikipedia_title")
  .not("bio_summary", "is", null)
  .eq("wikipedia_verified", false);
if (unverifiedError) throw unverifiedError;

const rows = [
  ...noBio.map((c) => ({ ...c, status: "no bio yet", prefillUrl: "" })),
  ...unverified.map((c) => ({
    ...c,
    status: "unverified auto-match",
    prefillUrl: c.wikipedia_title ? wikipediaUrl(c.wikipedia_title) : "",
  })),
].sort((a, b) => a.state_id.localeCompare(b.state_id) || a.name.localeCompare(b.name));

// race_candidates carries office/district for display context in the CSV
// — best-effort lookup, not required for ingestion.
const { data: raceCandidates } = await supabase
  .from("race_candidates")
  .select("candidate_id, races_2026!race_candidates_race_id_fkey(office, district_number)")
  .in(
    "candidate_id",
    rows.map((c) => c.id),
  );
const contextById = new Map(
  (raceCandidates ?? []).map((rc) => [rc.candidate_id, rc.races_2026]),
);

console.error(
  `${rows.length} candidate(s) need review — ${noBio.length} with no bio, ${unverified.length} with an unverified auto-match.`,
);

const csvEscape = (value) => {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

console.log("id,name,state,office,district,wikipedia_url,status");
for (const c of rows) {
  const race = contextById.get(c.id);
  console.log(
    [
      c.id,
      csvEscape(c.name),
      c.state_id,
      race?.office ?? "",
      race?.district_number ?? "",
      c.prefillUrl,
      c.status,
    ].join(","),
  );
}
