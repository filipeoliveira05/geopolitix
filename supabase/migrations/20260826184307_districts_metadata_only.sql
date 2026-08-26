-- Districts no longer store geometry per row (plan §7 step 10 decision):
-- geometry lives as a single combined TopoJSON blob in Supabase Storage
-- (one topology for all 436 districts, sharing borders between adjacent
-- ones — ~2.5MB vs. ~13MB as independent per-row GeoJSON), fetched once by
-- the map and joined client-side by state_id + district_number. `districts`
-- becomes metadata-only, letting terms.district_id / races_2026.district_id
-- finally resolve without paying that storage/egress cost.
--
-- id switches from a random uuid to the Census GEOID (e.g. "4801" for
-- Texas's 1st district) — a natural key, same pattern as
-- legislators.id/bioguide_id and governors.id/OpenStates person id. Table
-- has never been populated, so this is a safe type change, not a migration
-- of real data.
alter table terms drop constraint terms_district_id_fkey;
alter table races_2026 drop constraint races_2026_district_id_fkey;

alter table districts drop column geojson;
alter table districts alter column id type text;
alter table districts alter column id drop default;

alter table terms alter column district_id type text;
alter table races_2026 alter column district_id type text;

alter table terms add constraint terms_district_id_fkey
  foreign key (district_id) references districts(id);
alter table races_2026 add constraint races_2026_district_id_fkey
  foreign key (district_id) references districts(id);

alter table districts enable row level security;
create policy "public read access" on districts for select using (true);
grant select on districts to anon, authenticated;
