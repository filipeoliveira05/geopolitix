import type { ReactNode } from "react";
import { wikipediaUrl } from "@/lib/wikipedia";

/** Renders as a link to `title`'s article when available, plain text otherwise. */
function WikipediaBadgeLink({
  title,
  tooltip,
  className,
  children,
}: {
  title?: string | null;
  tooltip: string;
  className: string;
  children: ReactNode;
}) {
  if (title) {
    return (
      <a
        href={wikipediaUrl(title)}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} hover:underline`}
        title={`${tooltip} — click to view it`}
      >
        {children}
      </a>
    );
  }
  return (
    <span className={className} title={tooltip}>
      {children}
    </span>
  );
}

// A bio only gets this after a human actually checked it against the real
// Wikipedia page — never set by the automated exact-match search itself
// (see the wikipedia_verified column on candidates/legislators/governors/
// governor_terms). Static (not pulsing) since it isn't a "live" state like
// the app's other small colored dots — it's a one-time confirmation that
// doesn't change. Links straight to the confirmed article when a title is
// available (older verified rows predating the wikipedia_title column on
// governors/governor_terms may not have one — falls back to plain text).
export function WikipediaVerifiedBadge({ title }: { title?: string | null }) {
  return (
    <WikipediaBadgeLink
      title={title}
      tooltip="A person manually confirmed this bio against the real Wikipedia page"
      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
        <path d="M7 10.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Wikipedia verified
    </WikipediaBadgeLink>
  );
}

// A weaker guarantee than WikipediaVerifiedBadge, but stronger than a plain
// automated guess: this bio was matched via a maintained ID lookup — never
// a name search — so it doesn't carry the wrong-person risk a candidate's
// exact-match search does (see CLAUDE.md's Steve Cohen case). Still not a
// human eyeballing the page, though. Sky blue to sit visually between the
// emerald verified badge and the muted no-page badge.
//
// Three real sources currently qualify, each with its own label/tooltip:
// - "congress-legislators": legislators.mjs's backfillLegislatorBios reads
//   wikipedia_title directly off the row, populated from
//   unitedstates/congress-legislators' own curated bioguide→title mapping.
// - "wikidata": governor-history.mjs's fetchSitelinkTitles reads the
//   Wikipedia article straight from Wikidata's own structured sitelink
//   property for that exact QID — governors/governor_terms only.
// - "wikipedia-list": sports.mjs/college-football.mjs/college-basketball.mjs
//   read wikipedia_title straight off the wikilink TARGET on Wikipedia's own
//   team/program list page (extractLinkTarget) — the source page's own
//   editors point directly at the team's article, so like the other two
//   sources this carries no name-search ambiguity risk (see the candidates
//   table's Steve Cohen case in CLAUDE.md for what that risk looks like).
const SOURCE_LABELS = {
  "congress-legislators": {
    label: "Sourced from congress-legislators",
    tooltip: "Matched via congress-legislators' official bioguide-to-Wikipedia mapping, not manually checked",
  },
  wikidata: {
    label: "Sourced from Wikidata",
    tooltip: "Matched via Wikidata's own structured Wikipedia sitelink for this person, not manually checked",
  },
  "wikipedia-list": {
    label: "Sourced from Wikipedia",
    tooltip: "Matched via the wikilink on Wikipedia's own team/program list page, not manually checked",
  },
} as const;

export function WikipediaSourcedBadge({
  title,
  source,
}: {
  title?: string | null;
  source: keyof typeof SOURCE_LABELS;
}) {
  const { label, tooltip } = SOURCE_LABELS[source];
  return (
    <WikipediaBadgeLink
      title={title}
      tooltip={tooltip}
      className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2" fill="currentColor" />
      </svg>
      {label}
    </WikipediaBadgeLink>
  );
}

// The other side of the same manual audit: a human specifically confirmed
// no Wikipedia article exists for this person, rather than nobody having
// looked yet (see wikipedia_checked_no). Muted, not emerald — this isn't a
// "good" confirmation like a verified bio, just a settled fact that stops
// the automated backfill from retrying forever.
export function WikipediaNoPageBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 dark:text-zinc-500"
      title="A person manually confirmed no Wikipedia article exists for this person"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
      </svg>
      No Wikipedia page (confirmed)
    </span>
  );
}
