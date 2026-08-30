// Ingests a manually-reviewed candidates CSV (id,name,state,office,district,wikipedia_url)
// — the format exported for the user's manual Wikipedia-matching audit (see
// CLAUDE.md's candidate-profiles bullet). Each row's wikipedia_url is one of:
// - a real Wikipedia URL (fetched directly by title, no search — a human
//   already confirmed it's the right person)
// - the literal string "no" (confirmed no Wikipedia article exists)
// - anything else non-empty (e.g. "primaries not yet held") — a human
//   flagging this candidate as not reviewable right now, left untouched.
//   For a state whose primary genuinely hasn't happened yet, this pairs
//   with the same exclusion export-unreviewed-candidates.mjs applies (see
//   PENDING_PRIMARIES there) — the candidate naturally stops being
//   re-exported until that state's primary passes, so it won't nag for
//   review again before it's actually reviewable.
//
// Every row this touches (other than a skip) is a human decision, so:
// - a real URL sets wikipedia_verified = true (never set by the automated
//   search backfill in races-2026.mjs)
// - "no" sets wikipedia_checked_no = true, so backfillCandidateBios stops
//   retrying it every run
//
// Usage: node scripts/sync/ingest-candidate-csv.mjs manual-review/candidates-YYYY-MM-DD-review.csv
// (manual-review/ is gitignored — see export-unreviewed-candidates.mjs's
// own usage note.)
import { config } from "dotenv";
config({ path: new URL("../../.env.local", import.meta.url) });
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { readFileSync } from "node:fs";
import { fetchWikipediaSummary, withHardTimeout, mapWithConcurrency } from "./_wikipedia.mjs";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/sync/ingest-candidate-csv.mjs path/to/reviewed.csv");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } },
);

function parseCsv(path) {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const lines = text.split("\n").filter(Boolean);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const fields = [];
    let cur = "";
    let inQuotes = false;
    for (const c of line) {
      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (c === "," && !inQuotes) {
        fields.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    fields.push(cur);
    const obj = {};
    header.forEach((h, i) => (obj[h] = (fields[i] ?? "").trim()));
    return obj;
  });
}

function titleFromUrl(url) {
  const match = url.match(/\/wiki\/([^?#]+)/);
  if (!match) throw new Error(`Could not parse a Wikipedia title from URL: ${url}`);
  return decodeURIComponent(match[1]).replace(/_/g, " ");
}

const rows = parseCsv(csvPath);
const noRows = rows.filter((r) => r.wikipedia_url.toLowerCase() === "no");
const urlRows = rows.filter((r) => /\/wiki\//.test(r.wikipedia_url));
const blankRows = rows.filter((r) => !r.wikipedia_url);
const unresolvedRows = rows.filter(
  (r) => r.wikipedia_url && r.wikipedia_url.toLowerCase() !== "no" && !/\/wiki\//.test(r.wikipedia_url),
);

console.log(
  `${rows.length} rows: ${urlRows.length} confirmed URL, ${noRows.length} confirmed no-page, ` +
    `${unresolvedRows.length} not reviewable yet (left as-is), ${blankRows.length} left blank (skipped).`,
);
if (unresolvedRows.length > 0) {
  console.log(
    `  not reviewable yet: ${unresolvedRows.map((r) => `${r.name} (${r.wikipedia_url})`).join(", ")}`,
  );
}

if (noRows.length > 0) {
  const { error } = await supabase
    .from("candidates")
    .update({ wikipedia_checked_no: true })
    .in(
      "id",
      noRows.map((r) => r.id),
    );
  if (error) throw error;
  console.log(`Marked ${noRows.length} row(s) wikipedia_checked_no.`);
}

let ingested = 0;
let failed = 0;
// Concurrency 2 + fetchWikipediaSummary's own retry/backoff — same
// mechanism every other Wikipedia-calling sync script uses (see
// _wikipedia.mjs). A naive unthrottled sequential loop here hit sustained
// 429s partway through a real 160-URL run (66 succeeded, 94 failed) —
// this fixes that instead of just re-running to pick up stragglers.
await mapWithConcurrency(urlRows, 2, async (row) => {
  try {
    const title = titleFromUrl(row.wikipedia_url);
    const { bioSummary, photoUrl } = await withHardTimeout(
      (signal) => fetchWikipediaSummary(title, signal),
      90_000,
      `candidate summary (${row.id})`,
    );
    const { error } = await supabase
      .from("candidates")
      .update({
        wikipedia_title: title,
        bio_summary: bioSummary,
        photo_url: photoUrl,
        wikipedia_verified: true,
        wikipedia_checked_no: false,
      })
      .eq("id", row.id);
    if (error) throw error;
    ingested++;
  } catch (err) {
    failed++;
    console.error(`  failed for ${row.id} (${row.name}): ${err.message}`);
  }
});

console.log(`Ingested ${ingested}/${urlRows.length} confirmed bios${failed > 0 ? `, ${failed} failed` : ""}.`);
