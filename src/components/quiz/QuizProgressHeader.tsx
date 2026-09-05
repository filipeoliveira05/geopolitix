"use client";

import { useEffect, useRef, useState } from "react";

const COUNT_UP_MS = 500;

/**
 * Replaces the old plain "Question X of 10 — Score: 0" caption. A row of `total` segments (one
 * per question) fills solid `seal` as each question is answered — driven by `answeredCount`, not
 * `currentIndex`, since a question's score/points land the instant it's answered, before the
 * player clicks "Next" and `currentIndex` advances. The still-unanswered current question gets a
 * pulsing outline (same `animate-pulse` convention this app already uses for every other
 * "in-progress" indicator), everything after it stays a plain empty slot. The score pill counts up
 * from its old value over COUNT_UP_MS via requestAnimationFrame rather than jumping straight to
 * the new value, so a 10-point gain reads as a small celebratory tick-up.
 */
export function QuizProgressHeader({
  total,
  currentIndex,
  answeredCount,
  score,
}: {
  total: number;
  currentIndex: number;
  answeredCount: number;
  score: number;
}) {
  const [displayedScore, setDisplayedScore] = useState(score);
  const prevScoreRef = useRef(score);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevScoreRef.current;
    const to = score;
    if (from === to) return;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / COUNT_UP_MS, 1);
      setDisplayedScore(Math.round(from + (to - from) * progress));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevScoreRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [score]);

  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {Array.from({ length: total }, (_, i) => {
          const filled = i < answeredCount;
          const isCurrent = !filled && i === currentIndex;
          return (
            <div
              key={i}
              className={`flex-1 rounded transition-all duration-300 ease-out ${
                filled
                  ? "h-2 bg-seal"
                  : isCurrent
                    ? "h-2 animate-pulse bg-seal/40"
                    : "h-1.5 bg-rule"
              }`}
            />
          );
        })}
      </div>
      <span className="shrink-0 rounded bg-seal-soft px-2 py-1 font-mono text-xs font-medium text-seal">
        {displayedScore} pts
      </span>
    </div>
  );
}
