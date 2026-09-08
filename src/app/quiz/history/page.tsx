import { Card } from "@/components/Card";
import { SectionHeading } from "@/components/SectionHeading";
import { BackToMapLink } from "@/components/BackToMapLink";
import { QUIZ_CATEGORIES } from "@/lib/quiz/category-config";
import {
  getPlayCounts,
  getQuestionTypeStats,
  getWeakestSubjects,
  getRecentSessions,
} from "@/lib/quiz/history-data";

const RECENT_SESSIONS_LIMIT = 20;
const WEAKEST_SUBJECTS_LIMIT = 15;

function categoryLabel(id: string): string {
  return QUIZ_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

function modeLabel(mode: string): string {
  if (mode === "standard") return "Quiz";
  if (mode === "speed_round") return "Speed Round";
  return "Matching";
}

export default async function QuizHistoryPage() {
  const [playCounts, typeStats, weakestSubjects, recentSessions] = await Promise.all([
    getPlayCounts(),
    getQuestionTypeStats(),
    getWeakestSubjects(WEAKEST_SUBJECTS_LIMIT),
    getRecentSessions(RECENT_SESSIONS_LIMIT),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackToMapLink />
      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">Quiz History</h1>

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
        {typeStats.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No answers recorded yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {typeStats.map((s) => (
                <tr key={`${s.category}-${s.questionType}`} className="border-t border-rule">
                  <td className="py-1.5 text-ink">{s.questionType}</td>
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
        <SectionHeading>Weakest subjects</SectionHeading>
        <p className="mt-1 text-xs text-muted">Minimum 3 attempts.</p>
        {weakestSubjects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Not enough data yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {weakestSubjects.map((s) => (
                <tr key={`${s.category}-${s.subjectId}`} className="border-t border-rule">
                  <td className="py-1.5 text-ink">{s.subjectLabel}</td>
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
          <table className="mt-2 w-full text-sm">
            <tbody>
              {recentSessions.map((s) => (
                <tr key={s.id} className="border-t border-rule">
                  <td className="py-1.5 text-ink">
                    {categoryLabel(s.category)} — {modeLabel(s.mode)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-muted">
                    {s.mode === "matching"
                      ? `${s.mistakes} mistake${s.mistakes === 1 ? "" : "s"}`
                      : `${s.score}/${s.total}`}
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs text-muted">
                    {new Date(s.playedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
