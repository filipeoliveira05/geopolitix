// navigator.vibrate() is Android Chrome only — Safari/iOS doesn't expose the Vibration API to
// web pages at all, so this is silently a no-op there, not a bug to work around. Wrapped so
// every call site (regular round, speed round, matching) handles a missing/throwing API the
// same way once, rather than each duplicating its own try/catch — same "decorative, never
// blocks play" philosophy as this app's best-score/sync-freshness notes elsewhere.
export function vibrateWrongAnswer(): void {
  try {
    navigator.vibrate?.(120);
  } catch {
    // Unsupported or blocked (e.g. some in-app browsers throw instead of returning false) —
    // nothing to do, the quiz plays on exactly the same either way.
  }
}
