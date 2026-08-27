-- Full governor history per state, from Wikidata (no history endpoint exists
-- in OpenStates, which only covers current officeholders — see `governors`).
-- Shaped like `race_candidates` (plain name/party fields, no required FK to
-- a person table) rather than like `terms` (which requires a real
-- `legislators.id`) — historical governors predate OpenStates entirely and
-- have no natural equivalent id there. `governor_id` is nullable and only
-- set on the current term's row, which is the only one with a real
-- `governors.id` to link a /governor/[id] profile page to.
create table governor_terms (
  id uuid primary key default gen_random_uuid(),
  state_id text not null references states(id),
  governor_id text references governors(id),
  wikidata_person_id text not null,
  name text not null,
  party text not null,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  unique (state_id, wikidata_person_id, start_date)
);

create index governor_terms_state_id_idx on governor_terms(state_id);

alter table governor_terms enable row level security;
create policy "public read access" on governor_terms for select using (true);
grant select on governor_terms to anon, authenticated;
