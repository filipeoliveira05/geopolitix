import Link from "next/link";
import { Card } from "@/components/Card";
import { SectionHeading } from "@/components/SectionHeading";
import { QUIZ_CATEGORIES, type QuizCategoryId } from "@/lib/quiz/category-config";
import {
  getPlayCounts,
  getQuestionTypeStats,
  getWeakestSubjects,
  getRecentSessions,
  type QuestionTypeStat,
} from "@/lib/quiz/history-data";
import { CategoryIcon } from "@/components/quiz/category-icons";
import { questionTypeLabel } from "@/lib/quiz/question-type-labels";

const RECENT_SESSIONS_LIMIT = 20;
const WEAKEST_SUBJECTS_LIMIT = 15;
const MIN_ATTEMPTS_FOR_ACCURACY = 3;

function categoryLabel(id: string): string {
  return QUIZ_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

function modeLabel(mode: string): string {
  if (mode === "standard") return "Quiz";
  if (mode === "speed_round") return "Speed Round";
  return "Matching";
}

function groupByCategory(stats: QuestionTypeStat[]): { category: QuizCategoryId; rows: QuestionTypeStat[] }[] {
  return QUIZ_CATEGORIES.map((c) => ({
    category: c.id,
    rows: stats.filter((s) => s.category === c.id),
  })).filter((g) => g.rows.length > 0);
}

export default async function QuizHistoryPage() {
  const [playCounts, typeStats, weakestSubjects, recentSessions] = await Promise.all([
    getPlayCounts(),
    getQuestionTypeStats(),
    getWeakestSubjects(WEAKEST_SUBJECTS_LIMIT),
    getRecentSessions(RECENT_SESSIONS_LIMIT),
  ]);

  const totalSessions = playCounts.reduce((sum, p) => sum + p.sessionCount, 0);
  const totalAttempts = typeStats.reduce((sum, s) => sum + s.attempts, 0);
  const totalCorrect = typeStats.reduce((sum, s) => sum + s.correctCount, 0);
  const overallAccuracyPct =
    totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 1000) / 10 : null;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 animate-fade-in p-6 sm:p-10">
      <Link href="/quiz" className="text-sm text-muted hover:text-ink">
        ← Back to quiz
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">Quiz History</h1>

      {totalSessions > 0 && (
        <Card className="mt-4">
          <SectionHeading>Overview</SectionHeading>
          <p className="mt-2 text-sm text-ink">
            {totalSessions} session{totalSessions === 1 ? "" : "s"} played
            {overallAccuracyPct !== null && (
              <>
                {" "}
                · <span className="font-mono">{overallAccuracyPct}%</span> overall accuracy
              </>
            )}
          </p>
        </Card>
      )}

      <Card className="mt-4">
        <SectionHeading>Times played</SectionHeading>
        {playCounts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No sessions played yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {playCounts.map((p) => (
                <tr key={`${p.category}-${p.mode}`} className="border-t border-rule">
                  <td className="py-1.5 text-ink">
                    {categoryLabel(p.category)} — {modeLabel(p.mode)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-muted">{p.sessionCount}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-4">
        <SectionHeading>Accuracy by question type</SectionHeading>
        <p className="mt-1 text-xs text-muted">
          Accuracy shown after {MIN_ATTEMPTS_FOR_ACCURACY} attempts.
        </p>
        {typeStats.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No answers recorded yet.</p>
        ) : (
          groupByCategory(typeStats).map((group) => (
            <div key={group.category} className="mt-3 first:mt-2">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                <CategoryIcon category={group.category} className="h-3.5 w-3.5" />
                {categoryLabel(group.category)}
              </p>
              <table className="mt-1 w-full text-sm">
                <tbody>
                  {group.rows.map((s) => (
                    <tr key={s.questionType} className="border-t border-rule">
                      <td className="py-1.5 text-ink">{questionTypeLabel(s.questionType)}</td>
                      <td className="py-1.5 text-right font-mono text-muted">
                        {s.attempts < MIN_ATTEMPTS_FOR_ACCURACY
                          ? `${s.attempts} attempt${s.attempts === 1 ? "" : "s"}`
                          : `${s.correctCount}/${s.attempts} (${s.accuracyPct}%)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </Card>

      <Card className="mt-4">
        <SectionHeading>Weakest subjects</SectionHeading>
        <p className="mt-1 text-xs text-muted">Minimum 3 attempts.</p>
        {weakestSubjects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Not enough data yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {weakestSubjects.map((s) => (
                <tr key={`${s.category}-${s.subjectId}`} className="border-t border-rule">
                  <td className="py-1.5 text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      <CategoryIcon
                        category={s.category}
                        className="h-3.5 w-3.5 shrink-0 text-muted"
                      />
                      {s.subjectLabel}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-muted">
                    {s.correctCount}/{s.attempts} ({s.accuracyPct}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-4">
        <SectionHeading>Recent sessions</SectionHeading>
        {recentSessions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No sessions played yet.</p>
        ) : (
          <div className="mt-2 text-sm">
            {recentSessions.map((s) => (
              <div key={s.id} className="border-t border-rule py-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">
                    {categoryLabel(s.category)} — {modeLabel(s.mode)}
                  </span>
                  <span className="shrink-0 font-mono text-muted">
                    {s.mode === "matching"
                      ? `${s.mistakes} mistake${s.mistakes === 1 ? "" : "s"}`
                      : `${s.score}/${s.total}`}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-muted">
                  {new Date(s.playedAt).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
