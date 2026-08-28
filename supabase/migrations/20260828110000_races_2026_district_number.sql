-- House races (races_2026.office = 'house') are per-district, unlike Senate
-- and Governor races which are state-level — same distinction terms.district_number
-- already makes for House terms vs Senate. Nullable: only ever set for House rows.
alter table races_2026 add column district_number integer;
