"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import type { SearchSelectQuestion, SearchSelectEntry } from "@/lib/quiz/types";
import { vibrateWrongAnswer } from "@/lib/quiz/haptics";
import { PartyBadge } from "@/components/PartyBadge";
import { CheckIcon } from "./icons";

const WRONG_FLASH_MS = 400;

// Small in the search dropdown (a row of suggestions, not the main focus), bigger on a found/
// revealed slot (the actual answer being shown off). Falls back to a plain silhouette icon for a
// real candidate with no synced photo — same "fixed-size slot either way" reasoning
// QuizResultsScreen's own thumbnail-or-icon rows already use, so rows don't jump in size
// depending on which candidates happen to have a photo on file. A team logo isn't a face, so it
// gets a square `object-contain` box (same convention as MultipleChoiceQuestionView's revealTeams
// rows) instead of the circular `object-cover` crop used for a candidate photo — cropping a logo
// to a circle would cut off its edges.
function EntryAvatar({
  photoUrl,
  entityType,
  size,
}: {
  photoUrl: string | null;
  entityType: SearchSelectQuestion["entityType"];
  size: "sm" | "lg";
}) {
  const dimensionClassName = size === "sm" ? "h-8 w-8" : "h-12 w-12";
  const isLogo = entityType === "team";
  if (photoUrl) {
    return (
      <div
        className={`relative ${dimensionClassName} shrink-0 ${isLogo ? "" : "overflow-hidden rounded-full"}`}
      >
        <Image
          src={photoUrl}
          alt=""
          fill
          unoptimized
          className={isLogo ? "object-contain" : "object-cover"}
        />
      </div>
    );
  }
  if (isLogo) return <div className={`${dimensionClassName} shrink-0`} />;
  return (
    <span
      className={`flex ${dimensionClassName} shrink-0 items-center justify-center rounded-full bg-paper text-muted`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={size === "sm" ? "h-4 w-4" : "h-6 w-6"}
      >
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.8-3.6-5-8-5Z" />
      </svg>
    </span>
  );
}

export function SearchSelectQuestionView({
  question,
  result,
  onAnswer,
  search,
}: {
  question: SearchSelectQuestion;
  result: { foundIds: string[]; gaveUp: boolean } | null;
  onAnswer: (foundIds: string[], gaveUp: boolean) => void;
  search: (query: string) => SearchSelectEntry[];
}) {
  // Local play state (which targets have been found so far, the search box's current text, the
  // transient wrong-guess flash) resets naturally because QuestionSession wraps the active
  // question view in a container keyed on the session's question index — React remounts this
  // component fresh for every new question rather than reusing the same instance, so there's no
  // separate reset-on-prop-change effect needed here (that pattern would call setState
  // synchronously inside an effect, which is itself a real anti-pattern, not just a style nit).
  const [localFoundIds, setLocalFoundIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [wrongFlash, setWrongFlash] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrongFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (wrongFlashTimeoutRef.current) clearTimeout(wrongFlashTimeoutRef.current);
    },
    [],
  );

  const answered = result !== null;
  const foundIds = answered ? result.foundIds : localFoundIds;
  const targetIds = new Set(question.targets.map((t) => t.id));
  const suggestions =
    !answered && query.trim() ? search(query).filter((e) => !foundIds.includes(e.id)) : [];

  // Keyboard nav (arrow keys + Enter) is a desktop-only convenience — mobile players never see a
  // hardware keyboard's arrow keys, but a desktop player typing "bost" then arrowing down to the
  // right Boston team beats reaching for the mouse every time. Clamped rather than wrapped, same
  // as every other in-app list nav.
  function handleQueryKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectEntry(suggestions[Math.min(highlightedIndex, suggestions.length - 1)]);
    }
  }

  function flashWrong() {
    vibrateWrongAnswer();
    setWrongFlash(true);
    if (wrongFlashTimeoutRef.current) clearTimeout(wrongFlashTimeoutRef.current);
    wrongFlashTimeoutRef.current = setTimeout(() => setWrongFlash(false), WRONG_FLASH_MS);
  }

  function selectEntry(entry: SearchSelectEntry) {
    if (answered) return;
    setQuery("");
    if (targetIds.has(entry.id)) {
      const next = [...localFoundIds, entry.id];
      setLocalFoundIds(next);
      if (next.length === question.targets.length) onAnswer(next, false);
    } else {
      flashWrong();
    }
  }

  function giveUp() {
    if (answered) return;
    onAnswer(localFoundIds, true);
  }

  return (
    <div>
      <div className="relative mb-4 h-28 w-full">
        {question.silhouettePath ? (
          <svg viewBox="0 0 100 100" className="h-full w-full text-ink" aria-hidden="true">
            <path d={question.silhouettePath} fill="currentColor" fillRule="evenodd" />
          </svg>
        ) : (
          <Image src={question.imageUrl as string} alt="" fill unoptimized className="object-contain" />
        )}
      </div>
      <p className="mb-4 text-lg font-medium text-ink">{question.prompt}</p>

      {!answered && (
        <div className="relative mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleQueryKeyDown}
            placeholder="Type to search…"
            className={`w-full rounded border px-4 py-2 text-sm text-ink outline-none placeholder:text-muted ${
              wrongFlash ? "border-red-600" : "border-rule"
            }`}
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded border border-rule bg-surface">
              {suggestions.map((entry, i) => (
                <li key={entry.id}>
                  <button
                    onClick={() => selectEntry(entry)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink hover:bg-paper ${
                      i === highlightedIndex ? "bg-paper" : ""
                    }`}
                  >
                    {entry.photoUrl !== undefined && (
                      <EntryAvatar
                        photoUrl={entry.photoUrl}
                        entityType={question.entityType}
                        size="sm"
                      />
                    )}
                    <span>
                      {entry.label}
                      {entry.party !== undefined && (
                        <>
                          {" "}
                          <PartyBadge party={entry.party} />
                        </>
                      )}
                      {entry.league !== undefined && (
                        <span className="text-muted"> ({entry.league})</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {question.targets.map((target, i) => {
          const isFound = foundIds.includes(target.id);
          const isRevealed = isFound || answered;
          const hasPhoto = target.photoUrl !== undefined;
          return (
            <li
              key={target.id}
              className={`flex items-center gap-3 rounded border text-sm ${
                hasPhoto && isRevealed ? "px-3 py-2" : "px-3 py-1.5"
              } ${
                isFound ? "border-emerald-600 bg-emerald-600/10 text-ink" : "border-rule text-muted"
              }`}
            >
              <span className="font-mono text-xs text-muted">{i + 1}.</span>
              {isRevealed && hasPhoto && (
                <EntryAvatar
                  photoUrl={target.photoUrl as string | null}
                  entityType={question.entityType}
                  size="lg"
                />
              )}
              {isRevealed ? (
                <>
                  <span>
                    {target.label}
                    {target.party !== undefined && (
                      <>
                        {" "}
                        <PartyBadge party={target.party} />
                      </>
                    )}
                    {target.league !== undefined && (
                      <span className="text-muted"> ({target.league})</span>
                    )}
                  </span>
                  {isFound && <CheckIcon className="ml-auto h-4 w-4 text-emerald-600" />}
                </>
              ) : (
                <span>__________</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          Found {foundIds.length} / {question.targets.length}
        </p>
        {!answered && (
          <button
            onClick={giveUp}
            className="rounded border border-rule px-3 py-1.5 text-sm text-ink"
          >
            Give Up
          </button>
        )}
      </div>

      {answered && question.revealBorderMap && (
        <div className="relative mt-4 h-48 w-full animate-fade-in">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <path
              d={question.revealBorderMap.subject.path}
              fillRule="evenodd"
              className="fill-seal"
            />
            {question.revealBorderMap.neighbors.map((n) => (
              <path
                key={n.id}
                d={n.path}
                fillRule="evenodd"
                className={foundIds.includes(n.id) ? "fill-emerald-600" : "fill-muted"}
              />
            ))}
            <text
              x={question.revealBorderMap.subject.labelX}
              y={question.revealBorderMap.subject.labelY}
              fontSize="3.5"
              textAnchor="middle"
              stroke="var(--paper)"
              strokeWidth="0.6"
              paintOrder="stroke"
              className="fill-ink font-medium"
            >
              {question.revealBorderMap.subject.label}
            </text>
            {question.revealBorderMap.neighbors.map((n) => (
              <text
                key={n.id}
                x={n.labelX}
                y={n.labelY}
                fontSize="3.5"
                textAnchor="middle"
                stroke="var(--paper)"
                strokeWidth="0.6"
                paintOrder="stroke"
                className="fill-ink"
              >
                {n.label}
              </text>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
