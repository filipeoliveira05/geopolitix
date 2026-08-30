// A bio only gets this after a human actually checked it against the real
// Wikipedia page — never set by the automated exact-match search itself
// (see candidates.wikipedia_verified / legislators.wikipedia_verified).
// Static (not pulsing) since it isn't a "live" state like the app's other
// small colored dots — it's a one-time confirmation that doesn't change.
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
