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
 * Splits `total` into `parts` non-negative integers that sum to `total`, at random — used to size
 * a session's mix of question types. Each of the `total` slots independently rolls a uniform
 * random part index, so the resulting counts follow a true multinomial distribution: any part can
 * land on 0 (that question type just doesn't show up this session) or, at the other extreme, all
 * of `total` (deliberate — the user explicitly rejected a guaranteed-at-least-1-per-type split,
 * since with `parts` close to or equal to `total` that degenerates into an always-exactly-1-each
 * pattern with zero real variety, e.g. Geography's 10 generators against a 10-question session).
 */
export function randomWeightedSplit(total: number, parts: number): number[] {
  if (parts < 1) {
    throw new Error(`randomWeightedSplit: parts must be at least 1, got ${parts}`);
  }
  const counts = new Array(parts).fill(0) as number[];
  for (let i = 0; i < total; i++) {
    counts[Math.floor(Math.random() * parts)]++;
  }
  return counts;
}
