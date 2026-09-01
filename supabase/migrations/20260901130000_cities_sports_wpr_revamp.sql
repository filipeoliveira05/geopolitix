-- Full revamp of the cities/sports geography subsystem (2026-09-01): drops Wikidata as a data
-- source entirely in favor of World Population Review, and drops the sports_teams -> cities FK
-- entirely since the only thing it was ever used for was displaying a team's home city as plain
-- text ("New England Patriots (Foxborough)") — no `/city/[id]` page exists or was ever planned,
-- so normalizing it through a join, an is_support_row flag, and FK-preserving cleanup logic was
-- solving a problem that didn't need solving. sports_teams now just stores its own city name and
-- state directly; cities holds nothing but each state's real top 10 + capital.
--
-- `cities.latitude`/`longitude` are dropped too — confirmed via a full grep that nothing in
-- src/ ever reads them; WPR has no coordinate data to source them from going forward, and nothing
-- was rendering them anyway.
--
-- Wipes existing data in both tables per an explicit user decision to start over rather than
-- migrate it — the whole point of this change is that WPR replaces Wikidata as the source of
-- truth, so the old Wikidata-sourced rows (and the schema shape built around a design this
-- migration removes) aren't worth preserving or backfilling into the new shape.
--
-- NOT `truncate ... cascade`: cities is referenced by states.capital_city_id, and cascading a
-- truncate through that FK would wipe `states` too — which legislators/governors/districts/races
-- all in turn reference, so a naive cascade here would have taken down unrelated Phase 1 data
-- (caught before applying, not after). Explicit deletes in FK-safe order instead.
update states set capital_city_id = null;
delete from sports_teams;
delete from cities;

alter table cities
  drop column latitude,
  drop column longitude,
  drop column is_support_row;

alter table sports_teams
  drop column city_id,
  add column city_name text not null,
  add column state_id text not null references states(id);

create index sports_teams_state_id_idx on sports_teams(state_id);
