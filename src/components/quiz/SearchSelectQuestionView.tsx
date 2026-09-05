"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { SearchSelectQuestion, SearchSelectEntry } from "@/lib/quiz/types";
import { vibrateWrongAnswer } from "@/lib/quiz/haptics";
import { CheckIcon } from "./icons";

const WRONG_FLASH_MS = 400;

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
  // transient wrong-guess flash) resets naturally because QuestionSession renders this component
  // with a `key` derived from the session's question index — React remounts it fresh for every
  // new question rather than reusing the same instance, so there's no separate reset-on-prop-
  // change effect needed here (that pattern would call setState synchronously inside an effect,
  // which is itself a real anti-pattern, not just a style nit).
  const [localFoundIds, setLocalFoundIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [wrongFlash, setWrongFlash] = useState(false);
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
        <Image src={question.imageUrl} alt="" fill unoptimized className="object-contain" />
      </div>
      <p className="mb-4 text-lg font-medium text-ink">{question.prompt}</p>

      {!answered && (
        <div className="relative mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            className={`w-full rounded border px-4 py-2 text-sm text-ink outline-none placeholder:text-muted ${
              wrongFlash ? "border-red-600" : "border-rule"
            }`}
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded border border-rule bg-surface">
              {suggestions.map((entry) => (
                <li key={entry.id}>
                  <button
                    onClick={() => selectEntry(entry)}
                    className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-paper"
                  >
                    {entry.label}
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
          return (
            <li
              key={target.id}
              className={`flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                isFound ? "border-emerald-600 bg-emerald-600/10 text-ink" : "border-rule text-muted"
              }`}
            >
              <span className="font-mono text-xs text-muted">{i + 1}.</span>
              {isFound ? (
                <>
                  <span>{target.label}</span>
                  <CheckIcon className="ml-auto h-4 w-4 text-emerald-600" />
                </>
              ) : answered ? (
                <span>{target.label}</span>
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
    </div>
  );
}
