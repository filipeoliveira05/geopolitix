/**
 * Returns `count` distinct random items from `items` (Fisher-Yates partial shuffle) — also a
 * full shuffle when `count === items.length`. Throws rather than silently truncating when the
 * pool is too small: callers (question generators) must check pool size themselves first, since
 * a silently-short question set is a worse failure mode than a loud one.
 */
export function pickRandom<T>(items: T[], count: number): T[] {
  if (count > items.length) {
    throw new Error(`pickRandom: requested ${count} items from a pool of only ${items.length}`);
  }
  const pool = [...items];
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * pool.length);
    result.push(pool[index]);
    pool.splice(index, 1);
  }
  return result;
}

/**
 * Splits `total` into `parts` positive integers that sum to `total`, at random — used to size a
 * session's mix of question types on the fly instead of a hardcoded even/thirds split, so a
 * category with 2 or 3 question generators (and, as more get added, more) doesn't always show
 * them in the same fixed block sizes. Picks `parts - 1` distinct random cut points along
 * `[1, total - 1]` and takes the gaps between them, so every part is at least 1 and the exact
 * split varies session to session.
 */
export function randomSplit(total: number, parts: number): number[] {
  if (parts < 1) {
    throw new Error(`randomSplit: parts must be at least 1, got ${parts}`);
  }
  if (total < parts) {
    throw new Error(`randomSplit: total (${total}) must be at least parts (${parts})`);
  }
  if (parts === 1) return [total];

  const cuts = new Set<number>();
  while (cuts.size < parts - 1) {
    cuts.add(1 + Math.floor(Math.random() * (total - 1)));
  }
  const boundaries = [0, ...[...cuts].sort((a, b) => a - b), total];
  const counts: number[] = [];
  for (let i = 0; i < parts; i++) {
    counts.push(boundaries[i + 1] - boundaries[i]);
  }
  return counts;
}
