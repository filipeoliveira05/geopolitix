-- Adds logo_url to sports_teams/college_football_programs/college_basketball_programs, mirroring
-- the photo_url convention legislators/governors/candidates already use. Sourced the same way
-- those tables' Wikipedia-derived bios are: fetchWikipediaSummary() against each row's existing
-- wikipedia_title, whose REST API thumbnail is the team/program's own logo (confirmed live across
-- all 7 pro leagues plus college football/basketball before building this — a team's Wikipedia
-- infobox image IS its logo, no wrong-image risk since this is a direct known-title lookup, not a
-- name search). No grant needed — these are new columns on already-granted tables, not new tables.
alter table sports_teams add column logo_url text;
alter table college_football_programs add column logo_url text;
alter table college_basketball_programs add column logo_url text;
