-- Quiz history/record system (docs/superpowers/specs/2026-09-08-quiz-history-design.md).
-- Replaces the old localStorage-only best-score tracking (src/lib/quiz/best-score.ts, deleted in
-- a later step of this same plan) with full session history plus per-question-type and
-- per-subject correct/incorrect tracking. This is a personal-use, no-auth app (see CLAUDE.md's
-- "Open Decisions") — history is a single global record, not scoped to any user identity.

create table quiz_sessions (
  -- Generated client-side (crypto.randomUUID()) rather than defaulted server-side, so the same
  -- request that creates a session can insert its child quiz_answers rows referencing this id
  -- without a round-trip to read it back first.
  id uuid primary key,
  category text not null,
  mode text not null check (mode in ('standard', 'speed_round', 'matching')),
  -- score/total: points-based modes (standard, speed_round). mistakes/pair_count: matching only.
  -- Never both populated on the same row — enforced by the app, not a check constraint (a
  -- constraint here would need to special-case every mode combination for little real benefit).
  score int,
  total int,
  mistakes int,
  pair_count int,
  played_at timestamptz not null default now()
);
create index quiz_sessions_category_mode_idx on quiz_sessions(category, mode);

alter table quiz_sessions enable row level security;
create policy "public read access" on quiz_sessions for select using (true);
grant select on quiz_sessions to anon, authenticated;
grant select, insert, update, delete on quiz_sessions to service_role;

create table quiz_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references quiz_sessions(id) on delete cascade,
  -- Denormalized from the parent session — avoids a join for every stats query below.
  category text not null,
  -- Stable id per question-building function, e.g. "sports.team_logo" — see the per-generator
  -- table in docs/superpowers/plans/2026-09-08-quiz-history.md for the full list.
  question_type text not null,
  subject_id text not null,
  subject_label text not null,
  format text not null,
  correct boolean not null,
  -- Meaningful for multiple-choice/map-click rows; null for search-select rows, since points
  -- there are a whole-question value (searchSelectPoints()), not per-target.
  points int,
  answered_at timestamptz not null default now()
);
create index quiz_answers_session_id_idx on quiz_answers(session_id);
create index quiz_answers_question_type_idx on quiz_answers(question_type);
create index quiz_answers_subject_id_idx on quiz_answers(subject_id);

alter table quiz_answers enable row level security;
create policy "public read access" on quiz_answers for select using (true);
grant select on quiz_answers to anon, authenticated;
grant select, insert, update, delete on quiz_answers to service_role;

create view quiz_question_type_stats as
select
  question_type,
  category,
  count(*) as attempts,
  count(*) filter (where correct) as correct_count,
  round(100.0 * count(*) filter (where correct) / count(*), 1) as accuracy_pct
from quiz_answers
group by question_type, category;

create view quiz_subject_stats as
select
  subject_id,
  subject_label,
  category,
  count(*) as attempts,
  count(*) filter (where correct) as correct_count,
  round(100.0 * count(*) filter (where correct) / count(*), 1) as accuracy_pct
from quiz_answers
group by subject_id, subject_label, category;

create view quiz_play_counts as
select category, mode, count(*) as session_count, max(played_at) as last_played_at
from quiz_sessions
group by category, mode;

grant select on quiz_question_type_stats to anon, authenticated;
grant select on quiz_subject_stats to anon, authenticated;
grant select on quiz_play_counts to anon, authenticated;
