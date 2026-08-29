-- New: stable identity + backfilled bio for a candidate with no existing
-- app profile (a real challenger, not a current officeholder). Every bio
-- here comes from a best-effort Wikipedia name search — no reliable ID
-- like bioguide_id or a Wikidata QID exists for a scraped candidate name
-- — so the /candidate/[id] page always shows an unconditional disclaimer
-- rather than needing a bio_source flag.
--
-- race_candidates/races_2026 are fully deleted and re-inserted every
-- races-2026.mjs sync (no natural key to upsert against) — this table
-- exists precisely because a candidate's identity and backfilled bio need
-- to survive that weekly churn, the same problem legislators/terms and
-- governors/governor_terms already solved by splitting person from
-- per-cycle record.
create table candidates (
  id text primary key, -- slug: `${state_id}-${normalized-name}`, e.g. "ca-john-smith"
  name text not null,
  state_id text not null references states(id),
  wikipedia_title text,
  bio_summary text,
  photo_url text,
  last_synced_at timestamptz not null
);

-- Matching against current officeholders is recomputed fresh every sync
-- (see races-2026.mjs) directly on these disposable rows — no persistence
-- problem to solve there, since /legislator/[id]//governor/[id] URLs are
-- already stable. candidate_id is set only when NO match was found.
alter table race_candidates
  add column candidate_id text references candidates(id),
  add column matched_legislator_id text references legislators(id),
  add column matched_governor_id text references governors(id);

alter table candidates enable row level security;
create policy "public read access" on candidates for select using (true);
grant select on candidates to anon, authenticated;
-- The blanket service_role grant (20260826133154_service_role_grants.sql)
-- only covered tables that existed at that point in time — every table
-- created since has needed its own explicit grant (see
-- 20260827120500_governor_terms_service_role_grant.sql for the same note).
grant select, insert, update, delete on candidates to service_role;
