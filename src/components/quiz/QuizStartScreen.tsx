"use client";

import { useRef, useSyncExternalStore } from "react";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import { getBestScore, type BestScore } from "@/lib/quiz/best-score";
import { BackToMapLink } from "@/components/BackToMapLink";
import { Card } from "@/components/Card";
import { CategoryIcon } from "./category-icons";

// Every v1 question type needs at least 4 distinct subjects to build one 4-option question —
// see buildMultipleChoiceQuestion's own pool-size guard, which this mirrors so a doomed session
// never starts in the first place.
const MIN_POOL_SIZE = 4;

// No actual external change to subscribe to (a best score won't change while this screen is
// mounted) — this only exists to satisfy useSyncExternalStore's signature.
function subscribeToNothing() {
  return () => {};
}
function getServerBest() {
  return null;
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
  onStart: () => void;
  hasMatchingMode: boolean;
  onStartMatching: () => void;
  hasSpeedRoundMode: boolean;
  onStartSpeedRound: () => void;
}) {
  const canStart = !isLoading && poolSize >= MIN_POOL_SIZE;
  // Unlike the results screens (only ever reached via a client-side setPhase() call, so their own
  // lazy-initializer localStorage read never faces a real SSR pass), this screen IS the initial
  // phase — reached on a fresh page load, which DOES get server-rendered ("use client" only means
  // a component CAN use client-only hooks, not that Next skips server-rendering its initial HTML).
  // A lazy useState initializer here previously read localStorage directly, producing a real
  // mismatch confirmed live: server render sees no localStorage (throws, caught, returns null),
  // client hydration sees the real value — an extra "Best: X/Y" paragraph appears only on the
  // client, exactly the kind of diff React's hydration-mismatch warning flags. useSyncExternalStore
  // is React's own answer to "read an external store, safe across SSR/hydration": its
  // getServerSnapshot return value (null) is what hydration compares against, so the first client
  // render matches the server's; the real value then applies in the client's normal re-render path
  // rather than a setState-in-effect (which itself triggers an extra render pass, flagged by
  // react-hooks/set-state-in-effect).
  //
  // getSnapshot must return a referentially STABLE value when nothing's changed — getBestScore()
  // re-parses JSON on every call, so calling it directly here produced a fresh object every time
  // and threw React into an infinite "getSnapshot should be cached" render loop (confirmed live
  // via a real "Maximum update depth exceeded" crash before this cache was added). This screen
  // only ever needs ONE real read per mount anyway — it's always a fresh mount when it appears
  // (QuizCategoryClient's phase switch renders a different component type for every other phase,
  // so returning to "start" unmounts and remounts this component, not just a re-render), so a
  // plain per-mount ref cache is correct, not just a workaround.
  const cacheRef = useRef<{ categoryId: string; value: BestScore | null } | null>(null);
  const best = useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (!cacheRef.current || cacheRef.current.categoryId !== category.id) {
        cacheRef.current = { categoryId: category.id, value: getBestScore(category.id, null) };
      }
      return cacheRef.current.value;
    },
    getServerBest,
  );

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
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={onStart}
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
      ) : (
        <p className="mt-6 text-sm text-muted">Not enough data available for this category yet.</p>
      )}
    </div>
  );
}
