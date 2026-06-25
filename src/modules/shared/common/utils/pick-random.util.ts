/**
 * Return `count` elements sampled uniformly at random from `arr` (no mutation
 * of the input). Draws from a shrinking pool — unbiased, unlike a
 * `.sort(() => Math.random() - 0.5)`.
 */
export function pickRandom<T>(arr: T[], count: number): T[] {
  const pool = [...arr];
  const n = Math.min(count, pool.length);
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(Math.random() * pool.length);
    result.push(...pool.splice(j, 1));
  }
  return result;
}
