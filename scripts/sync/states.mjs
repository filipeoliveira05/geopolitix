// Seeds a minimal `states` table (id, name only) in Supabase — a structural
// prerequisite for `terms.state_id`/`districts.state_id` FKs, not the
// Phase 2 geography sync (population/capital/region stay null here; that's
// a separate sync job when Phase 2 starts, per the plan).
//
// Source: same as src/lib/us-states-geo.ts (us-atlas + fips-to-abbr.json),
// reimplemented standalone here since sync scripts run as plain Node, not
// through Next's TS/path-alias resolution.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { feature } from "topojson-client";
import { supabaseAdmin, logSync } from "./_supabase-admin.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const fipsToAbbr = JSON.parse(
  readFileSync(path.join(root, "src", "data", "fips-to-abbr.json"), "utf-8"),
);
const statesTopology = JSON.parse(
  readFileSync(
    path.join(root, "node_modules", "us-atlas", "states-10m.json"),
    "utf-8",
  ),
);

async function main() {
  const collection = feature(statesTopology, statesTopology.objects.states);

  const states = collection.features
    .map((f) => ({ id: fipsToAbbr[String(f.id)] ?? null, name: f.properties.name }))
    .filter((s) => s.id !== null);

  const supabase = supabaseAdmin();
  const startedAt = new Date().toISOString();
  const { error } = await supabase.from("states").upsert(states, { onConflict: "id" });

  await logSync(supabase, { source: "us-atlas + fips-to-abbr.json", startedAt, error });

  if (error) throw error;

  console.log(`Upserted ${states.length} states.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
