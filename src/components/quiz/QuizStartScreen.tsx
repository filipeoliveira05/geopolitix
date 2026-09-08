"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import { getBestSession } from "@/lib/quiz/history-data";
import type { QuestionFormat } from "@/lib/quiz/types";
import { getEnabledFormats, setEnabledFormats } from "@/lib/quiz/format-picker-storage";
import { BackToMapLink } from "@/components/BackToMapLink";
import { Card } from "@/components/Card";
import { CategoryIcon } from "./category-icons";
import { FormatPicker } from "./FormatPicker";

// Every v1 question type needs at least 4 distinct subjects to build one 4-option question —
// see buildMultipleChoiceQuestion's own pool-size guard, which this mirrors so a doomed session
// never starts in the first place.
const MIN_POOL_SIZE = 4;

// No actual external change to subscribe to (the format picker's enabled-formats value won't
// change while this screen is mounted) — this only exists to satisfy useSyncExternalStore's
// signature.
function subscribeToNothing() {
  return () => {};
}

export function QuizStartScreen({
  category,
  poolSize,
  isLoading,
  onStart,
  hasMatchingMode,
  onStartMatching,
  hasSpeedRoundMode,
  onStartSpeedRound,
}: {
  category: QuizCategoryMeta;
  poolSize: number;
  isLoading: boolean;
  onStart: (enabledFormats: QuestionFormat[]) => void;
  hasMatchingMode: boolean;
  onStartMatching: () => void;
  hasSpeedRoundMode: boolean;
  onStartSpeedRound: () => void;
}) {
  const canStart = !isLoading && poolSize >= MIN_POOL_SIZE;
  // A useQuery-sourced value has no SSR-hydration-mismatch risk the way a direct localStorage read
  // would (its data is undefined on both the server and the initial client render alike, so
  // there's nothing to reconcile) — unlike enabledFormats below, which still needs the
  // useSyncExternalStore treatment since it's genuinely backed by localStorage.
  const bestQuery = useQuery({
    queryKey: ["quiz-best", category.id, "standard"],
    queryFn: () => getBestSession(category.id, "standard"),
  });
  const best = bestQuery.data ?? null;

  // Same per-mount ref-cache + useSyncExternalStore idiom as `best` above, extended to also
  // WRITE: getServerSnapshot returns category.availableFormats (a stable module-level reference)
  // so the first client render matches the server's, then the real localStorage-backed value
  // takes over on the client — no separate setState-in-effect needed. toggleFormat mutates the
  // cached value directly and bumps `formatsVersion` (a plain useState call from an event
  // handler, not an effect) purely to force this component to re-render so useSyncExternalStore
  // re-reads the ref.
  const enabledFormatsCacheRef = useRef<{ categoryId: string; value: QuestionFormat[] } | null>(
    null,
  );
  const [, setFormatsVersion] = useState(0);
  const enabledFormats = useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (
        !enabledFormatsCacheRef.current ||
        enabledFormatsCacheRef.current.categoryId !== category.id
      ) {
        enabledFormatsCacheRef.current = {
          categoryId: category.id,
          value: getEnabledFormats(category.id, category.availableFormats),
        };
      }
      return enabledFormatsCacheRef.current.value;
    },
    () => category.availableFormats,
  );

  function toggleFormat(format: QuestionFormat) {
    const prev = enabledFormatsCacheRef.current?.value ?? category.availableFormats;
    const next = prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format];
    const safeNext = next.length > 0 ? next : prev; // never allow zero enabled formats
    setEnabledFormats(category.id, safeNext);
    enabledFormatsCacheRef.current = { categoryId: category.id, value: safeNext };
    setFormatsVersion((v) => v + 1);
  }

  return (
    <div className="mx-auto w-full max-w-lg text-center">
      <BackToMapLink />
      <Card className="mt-4">
        <CategoryIcon category={category.id} className="mx-auto h-10 w-10 text-seal" />
        <h1 className="mt-3 font-display text-3xl font-semibold text-ink">{category.label}</h1>
        <p className="mt-2 text-sm text-muted">{category.description}</p>
        {best && (
          <p className="mt-3 text-sm text-muted">
            Best: {best.score} / {best.total}
          </p>
        )}
      </Card>
      {isLoading ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : canStart ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          {category.availableFormats.length > 1 && (
            <FormatPicker
              availableFormats={category.availableFormats}
              enabledFormats={enabledFormats}
              onToggle={toggleFormat}
            />
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => onStart(enabledFormats)}
              className="rounded bg-seal px-6 py-3 text-sm font-medium text-white"
            >
              Start Quiz
            </button>
            {hasMatchingMode && (
              <button
                onClick={onStartMatching}
                className="rounded border border-rule px-6 py-3 text-sm text-ink"
              >
                Play Matching
              </button>
            )}
            {hasSpeedRoundMode && (
              <button
                onClick={onStartSpeedRound}
                className="rounded border border-rule px-6 py-3 text-sm text-ink"
              >
                Play Speed Round
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Not enough data available for this category yet.</p>
      )}
    </div>
  );
}
