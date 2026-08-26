-- Schema starting point per geopolitix-app-plan.md §4.
-- Table/field names here are a draft, not gospel; keep the plan doc in sync if this changes.

create type chamber as enum ('house', 'senate');
create type race_office as enum ('house', 'senate', 'governor');
create type race_status as enum ('open', 'called');
create type sync_trigger as enum ('cron', 'manual');
create type sync_status as enum ('success', 'error');

create table states (
  id text primary key,
  name text not null,
  population integer,
  flag_url text,
  region text,
  capital_city_id uuid
);

create table cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state_id text not null references states(id),
  population integer,
  is_capital boolean not null default false,
  latitude double precision,
  longitude double precision
);

alter table states
  add constraint states_capital_city_id_fkey
  foreign key (capital_city_id) references cities(id);

create table legislators (
  id text primary key,
  bioguide_id text not null unique,
  govtrack_id text,
  first_name text not null,
  last_name text not null,
  photo_url text,
  birthday date,
  bio_summary text
);

create table districts (
  id uuid primary key default gen_random_uuid(),
  state_id text not null references states(id),
  district_number integer not null,
  geojson jsonb not null,
  unique (state_id, district_number)
);

create table terms (
  id uuid primary key default gen_random_uuid(),
  legislator_id text not null references legislators(id),
  chamber chamber not null,
  state_id text not null references states(id),
  district_id uuid references districts(id),
  party text not null,
  start_date date not null,
  end_date date,
  is_current boolean not null default false
);

create table governors (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  photo_url text,
  bio_summary text,
  state_id text not null references states(id),
  party text not null,
  start_date date,
  end_date date
);

create table races_2026 (
  id uuid primary key default gen_random_uuid(),
  office race_office not null,
  state_id text not null references states(id),
  district_id uuid references districts(id),
  status race_status not null default 'open',
  winner_candidate_id uuid,
  last_synced_at timestamptz
);

create table race_candidates (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races_2026(id) on delete cascade,
  name text not null,
  party text not null,
  is_incumbent boolean not null default false
);

alter table races_2026
  add constraint races_2026_winner_candidate_id_fkey
  foreign key (winner_candidate_id) references race_candidates(id);

create table sports_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  league text not null,
  city_id uuid not null references cities(id)
);

create table sync_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  triggered_by sync_trigger not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status sync_status not null,
  error_message text
);

create index terms_legislator_id_idx on terms(legislator_id);
create index terms_state_id_idx on terms(state_id);
create index terms_is_current_idx on terms(is_current);
create index districts_state_id_idx on districts(state_id);
create index cities_state_id_idx on cities(state_id);
create index governors_state_id_idx on governors(state_id);
create index races_2026_state_id_idx on races_2026(state_id);
create index race_candidates_race_id_idx on race_candidates(race_id);
create index sports_teams_city_id_idx on sports_teams(city_id);
