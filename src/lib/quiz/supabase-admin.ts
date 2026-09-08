// Service-role Supabase client for the quiz-history Route Handler ONLY — never import this from
// any client component or any module that could end up in the browser bundle. Unlike
// scripts/sync/_supabase-admin.mjs (written for Node 20, which has no native WebSocket), this
// runs inside the Next.js server runtime on Node 22+, which has a native global WebSocket, so no
// `ws` package workaround is needed here.
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey);
}
