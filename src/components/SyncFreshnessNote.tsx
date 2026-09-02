"use client";

import { useState } from "react";

// "X synced Y ago" — small muted text, decorative, never the sole carrier
// of critical info. An item with a null `syncedAt` (query failed, or
// nothing has synced yet) is simply omitted rather than shown broken — see
// src/lib/sync-freshness.ts's own comment on why that lib never throws.
//
// Returns the leading number separately from its unit/suffix so only the
// number gets font-mono treatment (CLAUDE.md's own convention: mono for
// numbers/dates, not full phrases) — wrapping the whole "8 hours ago" string
// in font-mono put its internal word-spaces in a monospace glyph, which
// render visibly wider than the surrounding sans-serif text's spaces and
// read as a stray double space next to "hours"/"ago".
function timeAgo(date: Date): { value: string; suffix: string } {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return { value: String(days), suffix: `day${days === 1 ? "" : "s"} ago` };
  if (hours >= 1) return { value: String(hours), suffix: `hour${hours === 1 ? "" : "s"} ago` };
  if (minutes >= 1) return { value: String(minutes), suffix: `minute${minutes === 1 ? "" : "s"} ago` };
  return { value: "", suffix: "just now" };
}

// Reuses this app's existing "Live/pending" dot convention (amber
// animate-pulse for not-yet-decided races, emerald for a current
// officeholder — see CLAUDE.md) rather than inventing a new visual
// language: pulsing emerald genuinely means "fresh, synced within the
// last day," not just decoration. Amber (static) signals "aging, 1-7
// days," and a static neutral dot signals "stale, over a week" — the
// pulse itself is reserved for the one tier where "live" is an honest
// claim, same as everywhere else this convention is used in the app.
function freshnessTier(date: Date): { colorClassName: string; pulse: boolean; description: string } {
  const hours = (Date.now() - date.getTime()) / 3_600_000;
  if (hours < 24) return { colorClassName: "bg-emerald-500", pulse: true, description: "Synced within the last day" };
  if (hours < 24 * 7) return { colorClassName: "bg-amber-500", pulse: false, description: "Synced within the last week" };
  return { colorClassName: "bg-muted", pulse: false, description: "Synced over a week ago" };
}

function FreshnessItem({ label, syncedAt }: { label: string; syncedAt: Date }) {
  const { colorClassName, pulse, description } = freshnessTier(syncedAt);
  const { value, suffix } = timeAgo(syncedAt);
  return (
    <span className="inline-flex items-center whitespace-nowrap">
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${colorClassName} ${pulse ? "animate-pulse" : ""}`}
        title={description}
      />
      {label} synced{"\u00A0"}
      {value ? (
        <>
          <span className="font-mono">{value}</span>{"\u00A0"}
          {suffix}
        </>
      ) : (
        suffix
      )}
    </span>
  );
}

export function SyncFreshnessNote({
  label,
  syncedAt,
  className = "",
}: {
  label: string;
  syncedAt: Date | null;
  className?: string;
}) {
  return <SyncFreshnessRow items={[{ label, syncedAt }]} className={className} />;
}

// Above this many items, showing every one inline at once (a real problem on /state/[abbr] once
// it grew to 7 — legislators/governor/governor history/geography/sports/college football/college
// basketball) eats a disproportionate amount of vertical space right under the page's H1,
// especially on mobile where flex-wrap pushes it across several lines. Collapsed by default
// behind a one-line summary instead — the per-job detail underneath is completely unchanged, just
// not shown until asked for, so this doesn't reintroduce the "one combined number can mask a
// stale job" problem the per-item design above was built to avoid. A small page (1-3 items, e.g.
// /midterms-2026's single race-sync note) stays exactly as it always rendered — the toggle would
// be pointless ceremony around content that already fits on one line.
const COLLAPSE_THRESHOLD = 3;

function CollapsedSummary({
  worst,
  onExpand,
}: {
  worst: { colorClassName: string; pulse: boolean };
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="inline-flex items-center gap-1.5 text-xs text-muted"
      aria-expanded={false}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${worst.colorClassName} ${worst.pulse ? "animate-pulse" : ""}`}
      />
      Data freshness
      {/* Same rotate-on-expand chevron as CollapsibleGroup/HouseRacesByState — collapsed state
          only, since expanding here replaces this button entirely rather than revealing content
          beneath it (nothing to keep pointing at once open). */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3 shrink-0"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/**
 * Several jobs' freshness on one line (e.g. legislators/governors/governor
 * history on /state/[abbr]) — each item shown with its own honest
 * timestamp and tier, rather than collapsing them into a single combined
 * number that could mask one job being stale while another is fresh.
 */
export function SyncFreshnessRow({
  items,
  className = "",
}: {
  items: { label: string; syncedAt: Date | null }[];
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const known = items.filter(
    (item): item is { label: string; syncedAt: Date } => item.syncedAt !== null,
  );
  if (known.length === 0) return null;

  if (known.length > COLLAPSE_THRESHOLD && !isOpen) {
    // The stalest item's own tier — an honest "is anything here actually worth checking"
    // signal at a glance, not a fabricated combined status.
    const worstItem = known.reduce((oldest, item) =>
      item.syncedAt < oldest.syncedAt ? item : oldest,
    );
    return (
      <div className={className}>
        <CollapsedSummary worst={freshnessTier(worstItem.syncedAt)} onExpand={() => setIsOpen(true)} />
      </div>
    );
  }

  return (
    <p className={`flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted ${className}`}>
      {known.map((item) => (
        <FreshnessItem key={item.label} label={item.label} syncedAt={item.syncedAt} />
      ))}
    </p>
  );
}
