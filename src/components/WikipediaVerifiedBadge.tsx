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
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path
          fillRule="evenodd"
          d="M16.704 5.29a.75.75 0 0 1 .006 1.06l-7.5 7.75a.75.75 0 0 1-1.08.02l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.955 2.955 6.977-7.21a.75.75 0 0 1 1.06-.015Z"
          clipRule="evenodd"
        />
      </svg>
      Wikipedia verified
    </WikipediaBadgeLink>
  );
}

// A weaker guarantee than WikipediaVerifiedBadge, but stronger than a plain
// automated guess: this bio was matched via unitedstates/congress-legislators'
// own curated bioguide→Wikipedia-title mapping (legislators.mjs's
// backfillLegislatorBios reads wikipedia_title directly off the row, never
// a name search) — a maintained ID lookup, not a "top search hit" guess,
// but still not a human eyeballing the page. Sky blue to sit visually
// between the emerald verified badge and the muted no-page badge.
export function WikipediaSourcedBadge({ title }: { title?: string | null }) {
  return (
    <WikipediaBadgeLink
      title={title}
      tooltip="Matched via congress-legislators' official bioguide-to-Wikipedia mapping, not manually checked"
      className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z" />
        <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z" />
      </svg>
      Sourced from congress-legislators
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
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
          clipRule="evenodd"
        />
      </svg>
      No Wikipedia page (confirmed)
    </span>
  );
}
