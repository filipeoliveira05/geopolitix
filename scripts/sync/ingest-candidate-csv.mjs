// Ingests a manually-reviewed candidates CSV (id,name,state,office,district,wikipedia_url)
// — the format exported for the user's manual Wikipedia-matching audit (see
// CLAUDE.md's candidate-profiles bullet). Each row's wikipedia_url is either
// a real Wikipedia URL (fetched directly by title, no search — a human
// already confirmed it's the right person) or the literal string "no"
// (confirmed no Wikipedia article exists).
//
// Every row this touches is a human decision, so:
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

async function fetchWikipediaTitleSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Wikipedia summary fetch failed (${res.status}) for "${title}"`);
  const data = await res.json();
  return {
    bioSummary: data.extract ?? null,
    photoUrl: data.thumbnail?.source ?? null,
  };
}

function titleFromUrl(url) {
  const match = url.match(/\/wiki\/([^?#]+)/);
  if (!match) throw new Error(`Could not parse a Wikipedia title from URL: ${url}`);
  return decodeURIComponent(match[1]).replace(/_/g, " ");
}

const rows = parseCsv(csvPath);
const noRows = rows.filter((r) => r.wikipedia_url.toLowerCase() === "no");
const urlRows = rows.filter((r) => r.wikipedia_url && r.wikipedia_url.toLowerCase() !== "no");
const skippedRows = rows.filter((r) => !r.wikipedia_url);

console.log(
  `${rows.length} rows: ${urlRows.length} confirmed URL, ${noRows.length} confirmed no-page, ${skippedRows.length} left blank (skipped).`,
);

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
for (const row of urlRows) {
  try {
    const title = titleFromUrl(row.wikipedia_url);
    const { bioSummary, photoUrl } = await fetchWikipediaTitleSummary(title);
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
}

console.log(`Ingested ${ingested}/${urlRows.length} confirmed bios${failed > 0 ? `, ${failed} failed` : ""}.`);
