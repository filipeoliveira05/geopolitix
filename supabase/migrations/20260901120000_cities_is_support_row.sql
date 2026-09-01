-- `cities` holds two different kinds of row that were previously indistinguishable except by
-- inference (population rank): a state's real top-10-most-populous set, and a "support" row kept
-- alive purely because a sports_teams.city_id FK points to it (e.g. MA's Foxborough for the
-- Patriots) even though it isn't one of that state's top 10. geography.mjs/population-overlay.mjs
-- already knew this distinction internally (their cleanup passes already skip deleting a
-- FK-referenced row that fell out of the fresh top 10) but never persisted it, so any consumer
-- ranking `cities` by population alone couldn't tell the two apart.
--
-- Caught live 2026-09-01: NY's old Wikidata-era rows for Brooklyn/Queens/Manhattan/The Bronx (kept
-- alive only by the Nets/Mets/Knicks-Rangers/Yankees' city_id references, from before this app
-- consolidated NYC into one "New York" row matching reality) each carry a genuine multi-million
-- population figure — unlike Foxborough's tiny one, ranking ALL cities rows by population doesn't
-- naturally push these out of a naive "top 10 by population" query, so they were displaying ahead
-- of real distinct NY cities like Buffalo and Yonkers. An explicit flag, set by the sync scripts
-- that already know the answer, replaces that inference instead of adding another population-
-- based heuristic to guess it from the outside.
alter table cities add column if not exists is_support_row boolean not null default false;

comment on column cities.is_support_row is
  'True for a row kept alive only by a sports_teams.city_id FK reference, not because it is one of its state''s real top-10-most-populous cities. Excluded from "most populous cities" ranking/display; still joinable for a team''s home city.';
