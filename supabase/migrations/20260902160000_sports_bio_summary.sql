-- Adds bio_summary alongside logo_url (20260902150000_sports_logo_url.sql) to
-- sports_teams/college_football_programs/college_basketball_programs, for the new individual
-- team/program pages (/team/[id], /college-football/[id], /college-basketball/[id]). No new
-- fetch needed — fetchWikipediaSummary() already returns a bioSummary extract alongside the
-- thumbnail used for logo_url; backfillLogos (renamed backfillLogoAndBio) was simply discarding
-- it until now.
alter table sports_teams add column bio_summary text;
alter table college_football_programs add column bio_summary text;
alter table college_basketball_programs add column bio_summary text;
