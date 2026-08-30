-- Two independent flags added after a manual, name-by-name audit of every
-- 2026 race candidate (see CLAUDE.md's candidate-profiles bullet for the
-- exact-match matching history this audit was checking).
--
-- wikipedia_checked_no: distinguishes "no bio yet because nobody's looked"
-- from "a human confirmed there is no Wikipedia article for this person."
-- Without this, the recurring candidate-bio-backfill.yml run (every 3h)
-- keeps retrying the same confirmed-empty searches forever, wasting budget
-- that should go toward genuinely new/unreviewed candidates. Only
-- meaningful on candidates (legislators/governors don't have an
-- equivalent "no page exists" manual sweep).
--
-- wikipedia_verified: true only for a bio a human actually confirmed
-- against the real Wikipedia page — never set by the automated
-- exact-match search itself, even though that search is now safe against
-- wrong-person matches (see CLAUDE.md). Powers a "verified" badge on
-- /legislator/[id] and /candidate/[id] so a reader can tell an
-- automated-but-unreviewed bio apart from a manually checked one.
alter table candidates
  add column wikipedia_checked_no boolean not null default false,
  add column wikipedia_verified boolean not null default false;

alter table legislators
  add column wikipedia_verified boolean not null default false;
