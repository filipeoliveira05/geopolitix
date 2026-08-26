-- Supabase's cloud default is no Data API access to a new table without
-- explicit grants, even with an RLS policy in place. Scoped to the tables
-- the app actually reads today (states, legislators, terms) — grant on
-- other tables when their sync/read path is built.

alter table states enable row level security;
create policy "public read access" on states for select using (true);
grant select on states to anon, authenticated;

alter table legislators enable row level security;
create policy "public read access" on legislators for select using (true);
grant select on legislators to anon, authenticated;

alter table terms enable row level security;
create policy "public read access" on terms for select using (true);
grant select on terms to anon, authenticated;
