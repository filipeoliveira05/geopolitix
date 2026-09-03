-- Adds last_synced_at to the six tables that didn't already have it (candidates/terms/races_2026
-- got theirs earlier, for stale-row cleanup — see their own migrations). Powers a per-row
-- freshness note on each individual page (/legislator/[id], /governor/[id], /team/[id],
-- /college-football/[id], /college-basketball/[id]) instead of the site-wide/job-wide freshness
-- figure those pages showed before this — see CLAUDE.md's write-up on why a shared job timestamp
-- can be misleading for one specific row's own data. Nullable — existing rows have no value until
-- their next sync touches them; a null is simply omitted by SyncFreshnessNote (see its own
-- comment), not shown broken.
alter table legislators add column last_synced_at timestamptz;
alter table governors add column last_synced_at timestamptz;
alter table governor_terms add column last_synced_at timestamptz;
alter table sports_teams add column last_synced_at timestamptz;
alter table college_football_programs add column last_synced_at timestamptz;
alter table college_basketball_programs add column last_synced_at timestamptz;
