/**
 * Map over items with at most `limit` workers running at once, returning a
 * settled result per item (in input order). Never rejects — a worker that
 * throws yields a `rejected` result, so callers decide how to handle partial
 * failure. Caps simultaneous expensive work (e.g. signBlob calls, CPU-heavy
 * canvas renders) to bound concurrency and peak memory.
 */
export async function mapWithConcurrency<TIn, TOut>(
  items: readonly TIn[],
  limit: number,
  worker: (item: TIn, index: number) => Promise<TOut>,
): Promise<PromiseSettledResult<TOut>[]> {
  const results = new Array<PromiseSettledResult<TOut>>(items.length);
  const workers = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  async function run(): Promise<void> {
    // void-ok
    while (cursor < items.length) {
      const index = cursor++;
      // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion -- index < items.length
      const item = items[index]!;
      try {
        results[index] = {
          status: 'fulfilled',
          value: await worker(item, index),
        };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}
