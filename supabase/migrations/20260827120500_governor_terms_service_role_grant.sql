-- The blanket service_role grant (20260826133154_service_role_grants.sql)
-- only covered tables that existed at that point in time — `GRANT ... ON
-- ALL TABLES IN SCHEMA public` is a snapshot, not a standing default for
-- tables created afterward. governor_terms is the first genuinely new
-- table since then, so it needs its own explicit grant.
grant select, insert, update, delete on governor_terms to service_role;
