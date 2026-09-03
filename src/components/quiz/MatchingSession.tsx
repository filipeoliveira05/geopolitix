"use client";

import { useState } from "react";
import type { MatchingPair } from "@/lib/quiz/types";
import { pickRandom } from "@/lib/quiz/random";
import { vibrateWrongAnswer } from "@/lib/quiz/haptics";

type Tile = { pairId: string; content: string };

function tileClassName(
  pairId: string,
  solved: Set<string>,
  selected: string | null,
  flashed: string | undefined,
): string {
  const base = "rounded border border-rule px-3 py-3 text-sm text-ink";
  if (solved.has(pairId)) return `${base} border-emerald-500 bg-emerald-500/10 opacity-40`;
  if (flashed === pairId) return `${base} border-red-500 bg-red-500/10`;
  if (selected === pairId) return `${base} border-seal bg-seal-soft`;
  return `${base} hover:bg-paper`;
}

export function MatchingSession({
  pairs,
  onComplete,
}: {
  pairs: MatchingPair[];
  onComplete: (mistakes: number) => void;
}) {
  // Lazy initializers so each column shuffles once on mount, not on every re-render.
  const [imageTiles] = useState<Tile[]>(() =>
    pickRandom(pairs, pairs.length).map((p) => ({ pairId: p.id, content: p.imageUrl })),
  );
  const [nameTiles] = useState<Tile[]>(() =>
    pickRandom(pairs, pairs.length).map((p) => ({ pairId: p.id, content: p.name })),
  );
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ image: string; name: string } | null>(null);
  const [mistakes, setMistakes] = useState(0);

  function checkMatch(imagePairId: string, namePairId: string) {
    if (imagePairId === namePairId) {
      const next = new Set(solved);
      next.add(imagePairId);
      setSolved(next);
      setSelectedImage(null);
      setSelectedName(null);
      if (next.size === pairs.length) onComplete(mistakes);
    } else {
      vibrateWrongAnswer();
      setMistakes((m) => m + 1);
      setFlash({ image: imagePairId, name: namePairId });
      setTimeout(() => {
        setFlash(null);
        setSelectedImage(null);
        setSelectedName(null);
      }, 500);
    }
  }

  function selectImage(pairId: string) {
    if (solved.has(pairId) || flash) return;
    setSelectedImage(pairId);
    if (selectedName) checkMatch(pairId, selectedName);
  }

  function selectName(pairId: string) {
    if (solved.has(pairId) || flash) return;
    setSelectedName(pairId);
    if (selectedImage) checkMatch(selectedImage, pairId);
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="mb-4 text-sm text-muted">
        Match each logo to its team — {solved.size} / {pairs.length} solved, {mistakes} mistake
        {mistakes === 1 ? "" : "s"}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {imageTiles.map((t) => (
            <button
              key={t.pairId}
              disabled={solved.has(t.pairId)}
              onClick={() => selectImage(t.pairId)}
              className={tileClassName(t.pairId, solved, selectedImage, flash?.image)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external Wikimedia URL, same convention as photo_url elsewhere */}
              <img src={t.content} alt="" className="mx-auto h-10 w-10 object-contain" />
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {nameTiles.map((t) => (
            <button
              key={t.pairId}
              disabled={solved.has(t.pairId)}
              onClick={() => selectName(t.pairId)}
              className={tileClassName(t.pairId, solved, selectedName, flash?.name)}
            >
              {t.content}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
