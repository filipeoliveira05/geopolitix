-- House terms need to record which district they represent regardless of
-- whether that district's geometry has been synced yet (districts.mjs isn't
-- migrated to Supabase yet — still on the JSON stand-in). `district_id`
-- stays as the FK for joining to district geometry once that lands;
-- `district_number` is the plain fact, populated independently by
-- legislators.mjs.
alter table terms add column district_number integer;
