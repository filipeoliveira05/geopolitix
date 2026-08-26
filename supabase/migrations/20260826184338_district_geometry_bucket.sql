-- Public bucket holding the single combined district-geometry TopoJSON
-- blob (built/uploaded by scripts/sync/districts.mjs), fetched directly by
-- the browser — not a Postgres table, since it's one static rendering
-- asset, not per-row relational data (see districts_metadata_only.sql).
insert into storage.buckets (id, name, public)
values ('district-geometry', 'district-geometry', true);

create policy "public read access"
  on storage.objects for select
  using (bucket_id = 'district-geometry');
