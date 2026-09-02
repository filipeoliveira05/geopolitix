-- NCAA Division I FBS college football programs (scripts/sync/college-football.mjs), a
-- deliberately separate table from sports_teams rather than a new league value on it — college
-- programs carry a conference (no equivalent field on a pro team) and are amateur/institutional,
-- not "major-league" the way sports_teams' own UI copy already commits to (its empty state reads
-- "No major-league sports teams synced for this state"). Natural key is `school` (a program's own
-- Wikipedia article page name never repeats), mirroring the same-shaped decision already made for
-- cities (state_id, name) and sports_teams (league, name).
create table college_football_programs (
  id uuid primary key default gen_random_uuid(),
  school text not null,
  nickname text,
  city_name text not null,
  state_id text not null references states(id),
  conference text,
  wikipedia_title text,
  constraint college_football_programs_school_key unique (school)
);
create index college_football_programs_state_id_idx on college_football_programs(state_id);

alter table college_football_programs enable row level security;
create policy "public read access" on college_football_programs for select using (true);
grant select on college_football_programs to anon, authenticated;
