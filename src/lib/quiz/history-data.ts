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
