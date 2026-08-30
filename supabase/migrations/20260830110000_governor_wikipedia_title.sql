-- Lets a verified person's profile page link straight to the Wikipedia
-- article a human confirmed it against (see wikipedia_verified). candidates
-- and legislators already have wikipedia_title (20260829160000,
-- 20260829120000) — this brings governors/governor_terms in line so every
-- person table can resolve a URL the same way.
alter table governors add column wikipedia_title text;
alter table governor_terms add column wikipedia_title text;
