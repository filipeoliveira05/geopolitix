-- Backs /governor/[id] profile pages for historical governors (feasibility
-- confirmed live: 100% of the 2,288 distinct people already synced have a
-- Wikidata description, 97% have a photo). Per-person facts stored
-- redundantly across a person's own term rows (simpler than a separate
-- person table, given only ~140 of 2,288 people have more than one term)
-- and populated by governor-history.mjs's Wikipedia REST API backfill pass,
-- not this migration.
alter table governor_terms add column photo_url text;
alter table governor_terms add column bio_summary text;
