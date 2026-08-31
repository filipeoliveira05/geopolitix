-- Two findings from Supabase's Advisors, both confirmed live against the
-- database before writing this fix (not guessed):
--
-- 1. "Public Bucket Allows Listing" — district-geometry's bucket-level
--    `public: true` (20260826184338_district_geometry_bucket.sql) already
--    serves objects by direct URL with no RLS check at all; the separate
--    SELECT policy on storage.objects this migration added was only ever
--    needed for API-based listing/download, which nothing in this app does
--    (src/lib/districts-geo.ts fetches the known topology.json URL
--    directly). Dropping it removes the ability to enumerate every file in
--    the bucket via the API without changing how the app actually reads it.
--
-- 2. "Public/Signed-in users can execute rls_auto_enable()" — this function
--    isn't something this app created; it's a Supabase platform-installed
--    event trigger function (owned by `postgres`, SECURITY DEFINER, wired to
--    ddl_command_end as trigger "ensure_rls") that auto-enables RLS on new
--    public-schema tables — confirmed live via pg_proc/pg_event_trigger, not
--    assumed. Postgres grants EXECUTE to PUBLIC by default, which is why
--    Supabase's Advisors flag it as callable via `/rest/v1/rpc/rls_auto_enable`
--    — nothing in this app calls it, and it's only ever meant to run as an
--    event trigger, not a direct RPC.
drop policy if exists "public read access" on storage.objects;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
