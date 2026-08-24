// Maps a party name (as stored in mock-states.ts / legislators-data.ts,
// e.g. "Democrat", "Republican", "Independent") to a single-letter,
// color-coded badge. Falls back to "?" grey for anything unrecognized
// (third parties, future data) rather than guessing a color.
const PARTY_STYLES: Record<string, { letter: string; className: string }> = {
  Democrat: {
    letter: "D",
    className: "text-blue-600 dark:text-blue-400",
  },
  Republican: {
    letter: "R",
    className: "text-red-600 dark:text-red-400",
  },
  Independent: {
    letter: "I",
    className: "text-zinc-500 dark:text-zinc-400",
  },
};

const FALLBACK_STYLE = { letter: "?", className: "text-zinc-500 dark:text-zinc-400" };

export function PartyBadge({ party }: { party: string | null }) {
  const style = (party && PARTY_STYLES[party]) || FALLBACK_STYLE;
  return (
    <span className={`font-medium ${style.className}`} title={party ?? "Unknown party"}>
      ({style.letter})
    </span>
  );
}
