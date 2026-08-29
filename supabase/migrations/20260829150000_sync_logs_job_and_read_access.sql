-- Adds a stable `job` slug to sync_logs and opens it to public reads, for
-- the new "data last synced" freshness indicator in the app. `source` was
-- never a reliable grouping key for this — the same script already logs
-- different `source` strings depending on scope/mode (e.g. legislators.mjs
-- logs a YAML URL for a normal sync but a plain description for a
-- backfill-only run), so a real freshness feature needs an explicit,
-- consistent identifier per job instead of pattern-matching free text.
-- Nullable: existing rows predate this column and simply won't be
-- attributable to a job (fine — only the latest row per job matters for
-- freshness, and every script will start stamping this going forward).
alter table sync_logs add column job text;

alter table sync_logs enable row level security;
create policy "public read access" on sync_logs for select using (true);
grant select on sync_logs to anon, authenticated;
