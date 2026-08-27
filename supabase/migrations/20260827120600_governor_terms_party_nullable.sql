-- Unlike race_candidates/governors, historical figures from Wikidata can
-- genuinely lack a dated party statement (obscure 19th-century governors,
-- true independents) — PartyBadge already renders `null` as "no party
-- data" gracefully, so don't force the sync script to guess or fail on a
-- case with no real answer.
alter table governor_terms alter column party drop not null;
