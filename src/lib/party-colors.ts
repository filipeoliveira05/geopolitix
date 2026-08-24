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
