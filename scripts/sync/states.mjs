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
import { createChangeLog } from "./_change-log.mjs";

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

  const { data: existing, error: existingError } = await supabase.from("states").select("id, name");
  if (existingError) throw existingError;
  const existingById = new Map(existing.map((s) => [s.id, s.name]));

  const changeLog = createChangeLog();
  for (const state of states) {
    const previousName = existingById.get(state.id);
    if (previousName === undefined) changeLog.record("new", `${state.id}: ${state.name}`);
    else if (previousName !== state.name) {
      changeLog.record("renamed", `${state.id}: "${previousName}" -> "${state.name}"`);
    } else changeLog.record("unchanged");
  }

  const { error } = await supabase.from("states").upsert(states, { onConflict: "id" });

  await logSync(supabase, { source: "us-atlas + fips-to-abbr.json", startedAt, error, job: "states" });

  if (error) throw error;

  console.log(`Upserted ${states.length} states — ${changeLog.summary()}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
