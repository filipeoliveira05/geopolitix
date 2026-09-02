-- The blanket service_role grant (20260826133154_service_role_grants.sql) only covered tables
-- that existed at that point in time — same gotcha governor_terms/candidates already hit (see
-- 20260827120500_governor_terms_service_role_grant.sql). Caught live: college-football.mjs's
-- first real run failed with "permission denied for table college_football_programs" since the
-- table's own creation migration only granted anon/authenticated select, not service_role's
-- write access.
grant select, insert, update, delete on college_football_programs to service_role;
