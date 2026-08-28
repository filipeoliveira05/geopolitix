// Shared Supabase admin client for sync scripts (service-role key, full
// write access — never use this outside scripts/sync/*.mjs). Node 20 has no
// native WebSocket, which @supabase/supabase-js's realtime client requires
// even though sync scripts only ever do one-off queries — the `ws` package
// plugs that gap.
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local)",
    );
  }
  return createClient(url, serviceKey, { realtime: { transport: ws } });
}

// Set by the scheduled GitHub Actions workflow (.github/workflows/sync.yml);
// absent when run by hand via `npm run sync:*`.
export const TRIGGERED_BY = process.env.SYNC_TRIGGERED_BY === "cron" ? "cron" : "manual";

// `warnings` are non-fatal per-item issues (a missing lookup, a skipped
// duplicate) that don't fail the run (status stays "success") but are
// still worth surfacing — folded into error_message alongside a real
// error's own message when present.
export async function logSync(supabase, { source, startedAt, error, warnings }) {
  const warningMessage = warnings?.length ? warnings.join("; ") : null;
  await supabase.from("sync_logs").insert({
    source,
    triggered_by: TRIGGERED_BY,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: error ? "error" : "success",
    error_message: error?.message ?? warningMessage,
  });
}
