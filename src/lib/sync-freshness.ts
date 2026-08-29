import { supabase } from "./supabase";

// Reads `sync_logs` (populated by every scripts/sync/*.mjs script via
// logSync's `job` slug — see _supabase-admin.mjs) to power the "data last
// synced" freshness indicators across the app. Unlike the rest of this
// app's data-lib functions, these never throw — a freshness note is
// decorative, not core content, so a query failure (or an empty table, as
// in a fresh local dev DB) should just mean "don't show the note," not
// break the page it's on.

// The jobs a global "is the site's data fresh" figure should reflect.
// legislators_bio_backfill is deliberately excluded — it runs far more
// often (hourly, sometimes back-to-back manual runs) than the actual
// political data underneath it (terms, governors, races), so folding it in
// would make the global figure read "synced within the hour" almost
// permanently and hide a genuinely stale core sync.
const CORE_JOBS = ["states", "legislators", "governors", "governor_history", "races"] as const;

async function latestSuccessfulRun(job: string): Promise<Date | null> {
  const { data, error } = await supabase
    .from("sync_logs")
    .select("started_at")
    .eq("job", job)
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return new Date(data[0].started_at as string);
}

/**
 * The oldest of each core job's own latest successful run — i.e. "every
 * piece of core data is at least this fresh," not just whichever job
 * happened to run most recently. Returns null if any core job has never
 * synced successfully yet (fresh/broken DB), since "partially unknown"
 * isn't a freshness claim worth displaying.
 */
export async function getGlobalFreshness(): Promise<Date | null> {
  const runs = await Promise.all(CORE_JOBS.map(latestSuccessfulRun));
  if (runs.some((run) => run === null)) return null;
  return new Date(Math.min(...(runs as Date[]).map((run) => run.getTime())));
}

/** Latest successful run across the given job(s), for a page-level note. */
export async function getJobFreshness(jobs: string[]): Promise<Date | null> {
  const runs = await Promise.all(jobs.map(latestSuccessfulRun));
  const known = runs.filter((run): run is Date => run !== null);
  if (known.length === 0) return null;
  return new Date(Math.max(...known.map((run) => run.getTime())));
}
