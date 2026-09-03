import type { QuizCategoryId } from "@/lib/quiz/category-config";

// One glyph per category for QuizStartScreen's header — hand-drawn stroke SVGs matching this
// app's existing icon convention (GlobalHeader's search icon, StatePanel's close button, the
// check/x/pin icons in ./icons.tsx), not an icon library dependency.
const ICON_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.8 2.5 4.4 5.6 4.4 9s-1.6 6.5-4.4 9c-2.8-2.5-4.4-5.6-4.4-9s1.6-6.5 4.4-9Z" />
    </svg>
  );
}

function LandmarkIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M3 21h18" />
      <path d="M4 21V10M9 21V10M15 21V10M20 21V10" />
      <path d="M2 10 12 4l10 6" />
    </svg>
  );
}

function BallotIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      {/* A ballot box (trapezoid-topped bin) with a ballot slip about to go into its slot — an
          earlier version's box+strap shape read as a shopping bag instead. */}
      <path d="M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Z" />
      <path d="M4 11 6.5 5h11L20 11" />
      <rect x="9" y="2" width="6" height="7" rx="1" />
      <path d="m10.3 5.3 1.2 1.2 2.2-2.4" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4a3 3 0 0 0 3 5" />
      <path d="M17 5h3a3 3 0 0 1-3 5" />
      <path d="M12 14v3" />
      <path d="M9 21h6" />
      <path d="M9.5 17h5l.5 4H9l.5-4Z" />
    </svg>
  );
}

function ShuffleIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M3 6h3.5a4 4 0 0 1 3.2 1.6L15 17a4 4 0 0 0 3.2 1.6H21" />
      <path d="m18 4 3 3-3 3" />
      <path d="M3 18h3.5a4 4 0 0 0 3.2-1.6L11 14" />
      <path d="M14 8.4 15.2 6.8A4 4 0 0 1 18.4 5.2H21" />
      <path d="m18 20 3-3-3-3" />
    </svg>
  );
}

const CATEGORY_ICONS: Record<QuizCategoryId, (props: { className?: string }) => React.JSX.Element> = {
  geography: GlobeIcon,
  officeholders: LandmarkIcon,
  midterms: BallotIcon,
  sports: TrophyIcon,
  mashups: ShuffleIcon,
};

export function CategoryIcon({
  category,
  className = "h-10 w-10",
}: {
  category: QuizCategoryId;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon className={className} />;
}
