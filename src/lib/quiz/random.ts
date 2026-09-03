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
