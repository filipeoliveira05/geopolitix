-- terms.district_id / races_2026.district_id have been null since the day
-- they were introduced (20260826184307_districts_metadata_only.sql never
-- got a follow-up to actually populate them) — every sync script writes
-- district_number only, and every read path (getCurrentRepsByDistrictKey,
-- StateTabs, the map) joins on state_id + district_number, never this
-- column. Pure schema debt: a FK nothing writes and nothing reads. Dropped
-- rather than wired up, since there's no current feature that needs a
-- direct districts join over the existing two-step lookup — see CLAUDE.md's
-- "districts" entry for when this might be worth reintroducing.
alter table terms drop constraint terms_district_id_fkey;
alter table races_2026 drop constraint races_2026_district_id_fkey;

alter table terms drop column district_id;
alter table races_2026 drop column district_id;
