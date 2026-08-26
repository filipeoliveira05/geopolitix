-- service_role is the trusted key used only by scripts/sync/*.mjs (never
-- shipped to the browser) — grant it full table access up front rather than
-- re-discovering this per sync script the way the anon SELECT grants are
-- scoped incrementally per read path.
grant select, insert, update, delete on all tables in schema public to service_role;
