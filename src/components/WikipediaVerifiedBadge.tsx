// A bio only gets this after a human actually checked it against the real
// Wikipedia page — never set by the automated exact-match search itself
// (see the wikipedia_verified column on candidates/legislators/governors/
// governor_terms). Static (not pulsing) since it isn't a "live" state like
// the app's other small colored dots — it's a one-time confirmation that
// doesn't change.
export function WikipediaVerifiedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
      title="A person manually confirmed this bio against the real Wikipedia page"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path
          fillRule="evenodd"
          d="M16.704 5.29a.75.75 0 0 1 .006 1.06l-7.5 7.75a.75.75 0 0 1-1.08.02l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.955 2.955 6.977-7.21a.75.75 0 0 1 1.06-.015Z"
          clipRule="evenodd"
        />
      </svg>
      Wikipedia verified
    </span>
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
