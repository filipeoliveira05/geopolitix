// Explicitly temporary, not a general primary-date calendar (races-2026.mjs's
// RACES_SCOPE=pending deliberately avoids one — see its own comments) — just
// the states whose 2026 primary genuinely hadn't happened yet as of
// 2026-08-29 (originally MA, NH, RI, DE), each with a real known date. Needed
// because Wikipedia's infobox sometimes lists a confident-looking name for an
// unresolved primary with no "TBD"/"(presumptive)" hedge at all (confirmed
// live: MA's Jim McGovern/Ayanna Pressley House races), which the app's
// usual isPrimaryPending() text-pattern check can't catch — this cross-checks
// against the real date instead, for just these states.
//
// Self-expiring by design: each entry's `cutoff` is the day after that
// state's primary, so once today passes it, primaryPendingMessage() (in
// races-data.ts) stops flagging that state automatically — delete the
// entry (or the whole file, once all have passed) rather than leaving it
// around as dead code. MA already removed; NH/RI removed 2026-09-11 after
// their primaries resolved and the results were synced in.
export const PENDING_PRIMARIES: Record<string, { label: string; cutoff: string }> = {
  DE: { label: "Sep 15, 2026", cutoff: "2026-09-16" },
};

export function knownPendingPrimaryLabel(stateId: string): string | null {
  const entry = PENDING_PRIMARIES[stateId];
  if (!entry) return null;
  if (new Date() >= new Date(entry.cutoff)) return null;
  return entry.label;
}
