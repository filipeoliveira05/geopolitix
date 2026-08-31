"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Fuse from "fuse.js";
import type { SearchEntry } from "@/lib/search-index";

const MAX_RESULTS = 8;

type SearchOverlayProps = {
  onClose: () => void;
  entries: SearchEntry[] | undefined;
  isLoading: boolean;
};

// Icon-triggered overlay (opened from GlobalHeader's search button) — a
// centered panel with live, in-browser fuzzy matching against a
// pre-fetched index (see src/lib/search-index.ts for why client-side: no
// per-keystroke network round trip, results appear as you type). Same
// interaction on mobile and desktop.
//
// GlobalHeader only mounts this component while open (`{searchOpen && ...}`)
// rather than passing an `isOpen` prop and rendering null — a fresh mount on
// every open gives fresh useState defaults for free (empty query, index 0),
// no reset-on-open effect needed.
export function SearchOverlay({ onClose, entries, isLoading }: SearchOverlayProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const fuse = useMemo(
    () =>
      entries
        ? new Fuse(entries, { keys: ["name"], threshold: 0.35, ignoreLocation: true })
        : null,
    [entries],
  );

  const results = useMemo(() => {
    if (!fuse || !query.trim()) return [];
    return fuse
      .search(query.trim())
      .slice(0, MAX_RESULTS)
      .map((r) => r.item);
  }, [fuse, query]);

  // Clamped at read time (not via a reset-in-effect) — the raw activeIndex
  // still only moves via explicit arrow-key intent below; this just keeps
  // it in range as the result list's own length changes underneath it.
  const safeActiveIndex = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);

  // Focuses the input once, on mount — a DOM interaction, not React state,
  // so this doesn't trigger the "no setState in an effect" rule below.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Document-level Escape listener rather than only an onKeyDown on the
  // input — keeps closing reliable even if focus ever ends up elsewhere in
  // the panel (e.g. a clicked result row).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function navigateTo(entry: SearchEntry) {
    router.push(entry.href);
    onClose();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = results[safeActiveIndex];
      if (selected) navigateTo(selected);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[15vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search legislators, governors, candidates, states…"
          className="w-full border-b border-zinc-200 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />

        <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
          {isLoading && query.trim() && (
            <li className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Loading search index…</li>
          )}
          {!isLoading && query.trim() && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">No matches.</li>
          )}
          {results.map((entry, i) => (
            <li key={`${entry.type}-${entry.id}`} role="option" aria-selected={i === safeActiveIndex}>
              <button
                onClick={() => navigateTo(entry)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                  i === safeActiveIndex
                    ? "bg-blue-50 dark:bg-blue-950/40"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <ResultAvatar entry={entry} />
                <span className="flex flex-col items-start">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{entry.name}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{entry.subtitle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// A fixed-size slot so rows stay aligned whether or not a given entry has a
// photo — states never do, and a real person's photo can still be missing
// (see the coverage caveats documented in CLAUDE.md). `unoptimized` matches
// how /legislator/[id] etc. already render these same external URLs (no
// remotePatterns configured — this app never proxies photos through Next's
// image optimizer).
function ResultAvatar({ entry }: { entry: SearchEntry }) {
  if (entry.photoUrl) {
    return (
      <Image
        src={entry.photoUrl}
        alt=""
        width={32}
        height={32}
        unoptimized
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.8-3.6-5-8-5Z" />
      </svg>
    </span>
  );
}
