alter table races_2026 enable row level security;
create policy "public read access" on races_2026 for select using (true);
grant select on races_2026 to anon, authenticated;

alter table race_candidates enable row level security;
create policy "public read access" on race_candidates for select using (true);
grant select on race_candidates to anon, authenticated;
