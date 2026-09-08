import { supabase } from "@/lib/supabase";
import type { QuizCategoryId } from "./category-config";
import type { DerivedAnswerRow } from "./history-derive";

export type SessionMode = "standard" | "speed_round" | "matching";

// Decorative, never blocks play, same philosophy as this app's sync-freshness notes and the old
// best-score.ts — a failed read here just means "no best shown yet," not a broken page.
export async function getBestSession(
  category: QuizCategoryId,
  mode: "standard" | "speed_round",
): Promise<{ score: number; total: number } | null> {
  const { data, error } = await supabase
    .from("quiz_sessions")
    .select("score, total")
    .eq("category", category)
    .eq("mode", mode)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || data.score === null || data.total === null) return null;
  return { score: data.score, total: data.total };
}

export async function getBestMatching(
  category: QuizCategoryId,
): Promise<{ mistakes: number; pairCount: number } | null> {
  const { data, error } = await supabase
    .from("quiz_sessions")
    .select("mistakes, pair_count")
    .eq("category", category)
    .eq("mode", "matching")
    .order("mistakes", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data || data.mistakes === null || data.pair_count === null) return null;
  return { mistakes: data.mistakes, pairCount: data.pair_count };
}

export type PlayCount = {
  category: QuizCategoryId;
  mode: SessionMode;
  sessionCount: number;
  lastPlayedAt: string;
};

export async function getPlayCounts(): Promise<PlayCount[]> {
  const { data, error } = await supabase
    .from("quiz_play_counts")
    .select("category, mode, session_count, last_played_at")
    .order("last_played_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    category: row.category as QuizCategoryId,
    mode: row.mode as SessionMode,
    sessionCount: row.session_count as number,
    lastPlayedAt: row.last_played_at as string,
  }));
}

export type QuestionTypeStat = {
  questionType: string;
  category: QuizCategoryId;
  attempts: number;
  correctCount: number;
  accuracyPct: number;
};

export async function getQuestionTypeStats(): Promise<QuestionTypeStat[]> {
  const { data, error } = await supabase
    .from("quiz_question_type_stats")
    .select("question_type, category, attempts, correct_count, accuracy_pct")
    .order("accuracy_pct", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    questionType: row.question_type as string,
    category: row.category as QuizCategoryId,
    attempts: row.attempts as number,
    correctCount: row.correct_count as number,
    accuracyPct: row.accuracy_pct as number,
  }));
}

export type SubjectStat = {
  subjectId: string;
  subjectLabel: string;
  category: QuizCategoryId;
  attempts: number;
  correctCount: number;
  accuracyPct: number;
};

const MIN_SUBJECT_ATTEMPTS = 3;

export async function getWeakestSubjects(limit: number): Promise<SubjectStat[]> {
  const { data, error } = await supabase
    .from("quiz_subject_stats")
    .select("subject_id, subject_label, category, attempts, correct_count, accuracy_pct")
    .gte("attempts", MIN_SUBJECT_ATTEMPTS)
    .order("accuracy_pct", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => ({
    subjectId: row.subject_id as string,
    subjectLabel: row.subject_label as string,
    category: row.category as QuizCategoryId,
    attempts: row.attempts as number,
    correctCount: row.correct_count as number,
    accuracyPct: row.accuracy_pct as number,
  }));
}

export type SessionLogEntry = {
  id: string;
  category: QuizCategoryId;
  mode: SessionMode;
  score: number | null;
  total: number | null;
  mistakes: number | null;
  pairCount: number | null;
  playedAt: string;
};

export async function getRecentSessions(limit: number): Promise<SessionLogEntry[]> {
  const { data, error } = await supabase
    .from("quiz_sessions")
    .select("id, category, mode, score, total, mistakes, pair_count, played_at")
    .order("played_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    category: row.category as QuizCategoryId,
    mode: row.mode as SessionMode,
    score: row.score as number | null,
    total: row.total as number | null,
    mistakes: row.mistakes as number | null,
    pairCount: row.pair_count as number | null,
    playedAt: row.played_at as string,
  }));
}

export async function submitQuizSession(payload: {
  session: {
    id: string;
    category: QuizCategoryId;
    mode: SessionMode;
    score: number | null;
    total: number | null;
    mistakes: number | null;
    pairCount: number | null;
  };
  answers?: DerivedAnswerRow[];
}): Promise<void> {
  const res = await fetch("/api/quiz-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`quiz-history submit failed: ${res.status}`);
}
