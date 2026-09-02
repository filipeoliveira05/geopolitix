// Shared wikitext [[link]] cell parsing, extracted 2026-09-02 once a third script
// (college-basketball.mjs) needed the identical logic already duplicated in sports.mjs and
// college-football.mjs — same shared-helper convention as _wikidata.mjs/_wikipedia.mjs/
// _change-log.mjs.

/** First [[wikilink]]'s DISPLAY text ("[[A|B]]" -> "B", "[[A]]" -> "A"), ignoring anything after it. */
export function extractLinkText(cell) {
  const match = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(cell ?? "");
  if (!match) return null;
  return (match[2] ?? match[1]).trim();
}

/** First [[wikilink]]'s TARGET page name ("[[A|B]]" -> "A", "[[A]]" -> "A") — for wikipedia_title. */
export function extractLinkTarget(cell) {
  const match = /\[\[([^\]|]+)/.exec(cell ?? "");
  return match ? match[1].trim() : null;
}
