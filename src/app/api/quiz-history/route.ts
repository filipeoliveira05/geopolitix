import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/quiz/supabase-admin";

type SessionPayload = {
  id: string;
  category: string;
  mode: "standard" | "speed_round" | "matching";
  score: number | null;
  total: number | null;
  mistakes: number | null;
  pairCount: number | null;
};

type AnswerPayload = {
  category: string;
  questionType: string;
  subjectId: string;
  subjectLabel: string;
  format: string;
  correct: boolean;
  points: number | null;
};

export async function POST(request: Request) {
  const body = (await request.json()) as { session: SessionPayload; answers?: AnswerPayload[] };
  const db = supabaseAdmin();

  const { error: sessionError } = await db.from("quiz_sessions").insert({
    id: body.session.id,
    category: body.session.category,
    mode: body.session.mode,
    score: body.session.score,
    total: body.session.total,
    mistakes: body.session.mistakes,
    pair_count: body.session.pairCount,
  });
  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  if (body.answers && body.answers.length > 0) {
    const rows = body.answers.map((a) => ({
      session_id: body.session.id,
      category: a.category,
      question_type: a.questionType,
      subject_id: a.subjectId,
      subject_label: a.subjectLabel,
      format: a.format,
      correct: a.correct,
      points: a.points,
    }));
    const { error: answersError } = await db.from("quiz_answers").insert(rows);
    if (answersError) {
      return NextResponse.json({ error: answersError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
