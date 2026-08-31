-- Both `cities` and `sports_teams` were created (20260826072946_init_schema.sql /
-- 20260831160000_adopt_geography_scaffolding.sql) with only a surrogate uuid
-- primary key — fine while they were empty scaffolding, but Phase 2's sync
-- scripts (geography.mjs, sports.mjs) need to upsert by a real natural key so
-- reruns update existing rows instead of creating duplicates. A city's natural
-- key is (state, name); a team's is (league, name) — franchise
-- relocations/renames are rare enough that a plain name-based key is fine for
-- this app's scope (same class of decision as this app's other upsert keys).
alter table cities
  add constraint cities_state_id_name_key unique (state_id, name);

alter table sports_teams
  add constraint sports_teams_league_name_key unique (league, name);
