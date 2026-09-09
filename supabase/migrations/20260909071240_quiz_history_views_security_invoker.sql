-- Supabase's security advisor flags plain views as SECURITY DEFINER (Postgres default): they run
-- with the view creator's permissions/RLS bypass rather than the querying user's. Not an active
-- risk today — quiz_sessions/quiz_answers's only RLS policy is "using (true)" (unconditional
-- public read), so there's nothing to bypass yet — but security_invoker = on is cheap defense in
-- depth: if that RLS is ever tightened (e.g. per-user rows once real auth exists), these views
-- will respect it automatically instead of silently continuing to leak full data.
alter view quiz_question_type_stats set (security_invoker = on);
alter view quiz_subject_stats set (security_invoker = on);
alter view quiz_play_counts set (security_invoker = on);
