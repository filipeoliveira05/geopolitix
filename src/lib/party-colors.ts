// Single source of truth for party -> color across the app. Consumed two
// ways: `src/components/PartyBadge.tsx` (text UI, needs light+dark Tailwind
// classes) and `src/components/UsMap.tsx`'s `partyFillColor()` (MapLibre
// paint expression, needs one raw hex — WebGL doesn't read CSS/Tailwind).
// Keep both consumers pulling from here rather than hardcoding values, so
// the map and the text badges can't silently drift out of sync.
export type PartyStyle = {
  letter: string;
  hex: string;
  textClassName: string;
};

export const PARTY_COLORS: Record<string, PartyStyle> = {
  Democrat: {
    letter: "D",
    hex: "#2563eb", // Tailwind blue-600
    textClassName: "text-blue-600 dark:text-blue-400",
  },
  Republican: {
    letter: "R",
    hex: "#dc2626", // Tailwind red-600
    textClassName: "text-red-600 dark:text-red-400",
  },
  Independent: {
    letter: "I",
    hex: "#71717a", // Tailwind zinc-500
    textClassName: "text-zinc-500 dark:text-zinc-400",
  },
};

// Third parties, unmapped/unknown data — deliberately neutral rather than
// guessing a color.
export const FALLBACK_PARTY_STYLE: PartyStyle = {
  letter: "?",
  hex: "#a1a1aa", // Tailwind zinc-400
  textClassName: "text-zinc-500 dark:text-zinc-400",
};

export function partyStyle(party: string | null): PartyStyle {
  return (party && PARTY_COLORS[party]) || FALLBACK_PARTY_STYLE;
}

/**
 * Tallies a flat list of party strings by their single-letter badge (via
 * partyStyle() above, so a third party/null lands in the same "?" bucket
 * the map itself colors it — one source of truth, not a second
 * classification the map and this stat could drift apart on).
 */
export function tallyPartyLetters(parties: (string | null)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of parties) {
    const letter = partyStyle(p).letter;
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  return counts;
}

/** Map<letter, count> -> "53R–45D–2I" (leader first, matching how this kind of tally is usually read). */
export function formatPartyControl(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([letter, count]) => `${count}${letter}`)
    .join("–");
}
