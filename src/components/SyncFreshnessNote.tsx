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
  return (
    <p className={`text-xs text-zinc-500 dark:text-zinc-400 ${className}`}>
      {label} synced {timeAgo(syncedAt)}
    </p>
  );
}
