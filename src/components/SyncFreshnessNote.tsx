// "Data synced X ago" — small muted text, decorative, never the sole
// carrier of critical info. Renders nothing when `syncedAt` is null (query
// failed, or nothing has synced yet) rather than showing a broken/blank
// state — see src/lib/sync-freshness.ts's own comment on why that lib
// never throws.
function timeAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (minutes >= 1) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return "just now";
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
  return { colorClassName: "bg-zinc-400 dark:bg-zinc-600", pulse: false, description: "Synced over a week ago" };
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
  if (!syncedAt) return null;
  const { colorClassName, pulse, description } = freshnessTier(syncedAt);
  return (
    <p className={`text-xs text-zinc-500 dark:text-zinc-400 ${className}`}>
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${colorClassName} ${pulse ? "animate-pulse" : ""}`}
        title={description}
      />
      {label} synced {timeAgo(syncedAt)}
    </p>
  );
}
