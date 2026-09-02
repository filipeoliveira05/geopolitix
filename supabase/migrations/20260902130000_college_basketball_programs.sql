-- NCAA Division I men's basketball programs (scripts/sync/college-basketball.mjs) — same shape
-- as college_football_programs (20260902120000_college_football_programs.sql), a separate table
-- from sports_teams for the same reason: a college program carries a conference and is
-- amateur/institutional, not "major-league" the way sports_teams' own UI copy commits to.
--
-- Unlike the football source page, "List of NCAA Division I men's basketball programs" has no
-- city/state column at all — city_name/state_id here are joined in from a second page, "List of
-- NCAA Division I institutions," keyed by each school's wikilink TARGET (not display text, which
-- differs between the two independently-maintained pages) — see the sync script for the full
-- writeup.
create table college_basketball_programs (
  id uuid primary key default gen_random_uuid(),
  school text not null,
  nickname text,
  city_name text not null,
  state_id text not null references states(id),
  conference text,
  wikipedia_title text,
  constraint college_basketball_programs_school_key unique (school)
);
create index college_basketball_programs_state_id_idx on college_basketball_programs(state_id);

alter table college_basketball_programs enable row level security;
create policy "public read access" on college_basketball_programs for select using (true);
grant select on college_basketball_programs to anon, authenticated;

-- Included here up front this time, unlike college_football_programs, which needed a follow-up
-- migration after a real "permission denied" error live — the blanket service_role grant
-- (20260826133154_service_role_grants.sql) only covers tables that existed at that point in time.
grant select, insert, update, delete on college_basketball_programs to service_role;
