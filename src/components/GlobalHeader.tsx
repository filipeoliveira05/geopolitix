"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { buildSearchIndex } from "@/lib/search-index";
import { SearchOverlay } from "@/components/SearchOverlay";

// Rendered on every route (src/app/layout.tsx) — the one place all three
// phases (politics/geography/quiz) hang a nav entry off, instead of every
// page inventing its own way back. See
// docs/superpowers/specs/2026-08-31-global-search-nav-design.md.
//
// `/` is a deliberately chrome-free h-dvh fullscreen map (see UsMap's own
// framing conventions) — the header floats as a fixed, semi-transparent
// overlay there instead of normal flow content, so it never eats into the
// map's height. Every other page gets it as a normal sticky bar (in flow,
// solid background). UsMap's own top-anchored controls are shifted down to
// clear this overlay (see UsMap.tsx).
export function GlobalHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [searchOpen, setSearchOpen] = useState(false);
  // Prefetch on hover/focus (before the click that opens the overlay) so
  // the index is likely already loading — or done — by the time the panel
  // actually appears. Once true, stays true: nobody who never touches
  // search pays this fetch's cost, but a second visit to the button
  // shouldn't refetch.
  const [wantsIndex, setWantsIndex] = useState(false);
  const { data: entries, isLoading } = useQuery({
    queryKey: ["search-index"],
    queryFn: buildSearchIndex,
    enabled: wantsIndex,
    staleTime: Infinity,
  });

  function openSearch() {
    setWantsIndex(true);
    setSearchOpen(true);
  }

  return (
    <>
      <header
        className={`z-50 flex h-14 items-center justify-between gap-4 px-4 sm:px-6 ${
          isHome ? "fixed inset-x-0 top-0 bg-surface/85 backdrop-blur-sm" : "sticky top-0 border-b border-rule bg-surface"
        }`}
      >
        <Link href="/" className="font-display text-lg font-semibold text-ink">
          Geopolitix
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/midterms-2026" className="text-muted hover:text-seal">
            Midterms 2026
          </Link>
          {/* Phase 2/3 — light up once those sections exist; no functional
              change needed here when they do, just flip these to real links. */}
          <span className="hidden cursor-default text-muted/50 sm:inline">Geography</span>
          <span className="hidden cursor-default text-muted/50 sm:inline">Quiz</span>
          <button
            onClick={openSearch}
            onMouseEnter={() => setWantsIndex(true)}
            onFocus={() => setWantsIndex(true)}
            aria-label="Search"
            className="rounded p-1.5 text-muted hover:bg-seal-soft hover:text-seal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        </nav>
      </header>

      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          entries={entries}
          isLoading={isLoading}
        />
      )}
    </>
  );
}
