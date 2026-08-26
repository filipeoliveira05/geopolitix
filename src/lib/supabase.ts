import { PostgrestClient } from "@supabase/postgrest-js";

// Read-only PostgREST client (not the full @supabase/supabase-js) — the app
// only ever selects data with the public anon key (RLS-gated, no auth, no
// realtime subscriptions), so the lighter client avoids @supabase/supabase-js
// unconditionally constructing a RealtimeClient that requires a WebSocket
// constructor — a problem in Node < 22 (no native WebSocket) that would
// otherwise need a Node-only workaround leaking into code shared with the
// browser bundle. Safe to use from both Server Components and client
// components (anon key is public by design; access is governed by Postgres
// RLS policies, see supabase/migrations).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = new PostgrestClient(`${url}/rest/v1`, {
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
});
