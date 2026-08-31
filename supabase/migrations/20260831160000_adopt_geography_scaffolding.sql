-- `cities`/`sports_teams` (and `states.capital_city_id`) were created directly
-- against the live database very early in the project (before this migration
-- workflow was established) as Phase 2 (geography/sports) scaffolding — real
-- schema, never populated, but entirely outside version control. Confirmed
-- live via psql: both tables exist with 0 rows and no migration file ever
-- created them. Supabase's platform-level "auto enable RLS on new tables"
-- event trigger (see the security_advisor_fixes migration for more on that
-- function) enabled RLS the moment these were created, but — unlike every
-- other table in this app, where a migration always pairs table creation
-- with its RLS policy + grant in one file — nothing ever added the matching
-- public-read policy, since these were never created through that pattern.
-- Flagged by Supabase's Advisors ("RLS Enabled No Policy") and confirmed with
-- the user as legitimate early scaffolding, not accidental — this migration
-- adopts the existing schema into version control (idempotent — matches what
-- already exists live, so it's a no-op for the tables/column, only the
-- policy/grant below are new) rather than dropping it.
--
-- Not wired into any sync script or app page yet — Phase 2 hasn't started
-- (see CLAUDE.md's Status section); the actual source/sync strategy is still
-- an open decision. This migration only closes the version-control gap and
-- the advisor findings, it doesn't populate or read from these tables.
create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state_id text not null references states(id),
  population integer,
  is_capital boolean not null default false,
  latitude double precision,
  longitude double precision
);
create index if not exists cities_state_id_idx on cities(state_id);

alter table states add column if not exists capital_city_id uuid references cities(id);

create table if not exists sports_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  league text not null,
  city_id uuid not null references cities(id)
);
create index if not exists sports_teams_city_id_idx on sports_teams(city_id);

-- Same "public read access" pattern every other table in this app uses
-- (e.g. 20260829160000_candidates.sql) — RLS was already enabled (the
-- platform trigger did that on creation), this just adds the missing policy
-- and the anon/authenticated grant Data API access needs (service_role
-- already has a blanket grant from 20260826133154_service_role_grants.sql).
alter table cities enable row level security;
create policy "public read access" on cities for select using (true);
grant select on cities to anon, authenticated;

alter table sports_teams enable row level security;
create policy "public read access" on sports_teams for select using (true);
grant select on sports_teams to anon, authenticated;
