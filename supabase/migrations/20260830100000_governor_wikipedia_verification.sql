-- Extends 20260830090000_wikipedia_verification.sql's flags to governors
-- and governor_terms, so a manual bio audit (like the one already done for
-- candidates) can eventually cover every person in the app, not just
-- candidates/legislators. Same meaning as before: wikipedia_verified is
-- true only after a human confirms the bio against the real page;
-- wikipedia_checked_no is true only after a human confirms no Wikipedia
-- article exists — never set by any automated backfill.
--
-- governors.wikipedia_verified/wikipedia_checked_no track governor_terms'
-- values for a state's current officeholder (copyCurrentBiosToGovernors()
-- in governor-history.mjs now copies these alongside bio_summary/photo_url,
-- same reasoning as that existing copy).
alter table governors
  add column wikipedia_verified boolean not null default false,
  add column wikipedia_checked_no boolean not null default false;

alter table governor_terms
  add column wikipedia_verified boolean not null default false,
  add column wikipedia_checked_no boolean not null default false;

-- legislators already has wikipedia_verified (20260830090000); add the
-- matching wikipedia_checked_no here too so every person-table has both
-- flags available, even though no legislator audit exists yet.
alter table legislators
  add column wikipedia_checked_no boolean not null default false;
