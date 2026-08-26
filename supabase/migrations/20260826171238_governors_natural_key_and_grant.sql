-- governors.mjs uses OpenStates' own person id (e.g.
-- "ocd-person/d73f10ee-...") as a stable natural key, same pattern as
-- legislators.id using bioguide_id — lets upserts stay idempotent across
-- runs instead of minting a new random uuid every sync. Table is empty so
-- far, safe to change type in place.
alter table governors alter column id type text;
alter table governors alter column id drop default;

alter table governors enable row level security;
create policy "public read access" on governors for select using (true);
grant select on governors to anon, authenticated;
