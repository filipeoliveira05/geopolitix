-- Lets legislators.mjs reorder its terms sync to "insert new rows first,
-- delete old ones only after every new row succeeds" instead of
-- delete-then-insert — the same reorder races_2026 already got and for the
-- same reason: a delete-then-insert that fails partway through leaves the
-- table genuinely incomplete (not just stale) until the next successful
-- run. Nullable: existing rows predate this column and are treated as
-- stale (safe to replace) on the very next successful sync, same as any
-- row from a prior run would be.
alter table terms add column last_synced_at timestamptz;
