// Shared per-run change tracker for sync scripts — every script was
// previously reporting only aggregate counts ("Upserted 51 states.",
// "Backfilled 2 candidate bio(s)."), which answers "how many" but not "what
// actually changed" (which rows, which fields, which outcome per item) —
// confirmed as a real gap live, via GitHub Actions logs that gave no way to
// tell a genuine new bio from a silent "no Wikipedia match" without a
// separate Supabase query. `record()` categorizes every item as it's
// processed (e.g. "new", "updated", "unchanged", "failed") with an optional
// human-readable label; `summary()` renders one line per category, with
// itemized labels capped so a large population (e.g. ~12,700 legislators)
// doesn't flood the log — the category TOTAL is still exact even once the
// itemized list is capped.
const ITEM_CAP = 25;

export function createChangeLog() {
  const counts = new Map();
  const items = new Map();

  function record(category, label) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
    if (label) {
      const list = items.get(category) ?? [];
      if (list.length < ITEM_CAP) list.push(label);
      items.set(category, list);
    }
  }

  function summary() {
    if (counts.size === 0) return "no changes";
    return [...counts.entries()]
      .map(([category, count]) => {
        const list = items.get(category);
        if (!list || list.length === 0) return `${count} ${category}`;
        const more = count > list.length ? `, +${count - list.length} more` : "";
        return `${count} ${category} (${list.join("; ")}${more})`;
      })
      .join("; ");
  }

  return { record, summary, counts };
}
