"use client";

import { useState, type ReactNode } from "react";

// Generic collapsible group header — same rotating-chevron interaction as
// HouseRacesByState.tsx's per-state rows, but without that component's
// TanStack Query lazy-fetch machinery: the data behind every group here is
// already small and already loaded via props (a single state's sports
// teams/college programs), so there's nothing to defer fetching for. This
// is purely a display/scannability grouping, which is also why every group
// defaults open rather than collapsed — collapsing exists so a reader can
// tidy a group away, not because any single group is too large to show.
export function CollapsibleGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border-b border-rule last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          {/* An SVG rotates symmetrically around its viewBox center — a text
              glyph like "›" doesn't (its ink isn't centered in its own em
              box), so rotating that instead would sit visibly off-center
              against the title next to it. Same icon HouseRacesByState.tsx
              uses for the identical reason. */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3 w-3 shrink-0 text-muted transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="text-xs font-medium uppercase tracking-wide text-muted">{title}</span>
        </span>
        <span className="text-muted">{count}</span>
      </button>
      {isOpen && <div className="flex flex-col gap-1 pb-2 pl-5">{children}</div>}
    </div>
  );
}
