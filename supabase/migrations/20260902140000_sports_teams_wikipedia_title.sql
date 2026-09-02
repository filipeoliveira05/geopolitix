-- Mirrors college_football_programs/college_basketball_programs' wikipedia_title (and
-- candidates/legislators/governors before that) so a sports_teams row can link straight to its
-- Wikipedia article too, same as the college program groups already do. sports.mjs's team cell
-- is itself a [[wikilink]] to the team's own article, so no extra fetch is needed — just capture
-- the link target alongside the display text already extracted.
alter table sports_teams add column wikipedia_title text;
