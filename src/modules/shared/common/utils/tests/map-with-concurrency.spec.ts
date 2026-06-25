import { mapWithConcurrency } from '../map-with-concurrency';

describe('mapWithConcurrency', () => {
  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapWithConcurrency(items, 4, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('returns results in input order regardless of completion timing', async () => {
    const items = [3, 1, 2];
    const settled = await mapWithConcurrency(items, 3, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 10;
    });
    expect(
      settled.map((s) => (s.status === 'fulfilled' ? s.value : null)),
    ).toEqual([30, 10, 20]);
  });

  it('returns a settled result per item and never throws on rejection', async () => {
    const items = ['a', 'b', 'c'];
    const settled = await mapWithConcurrency(items, 2, async (s) => {
      if (s === 'b') throw new Error('boom');
      return s;
    });
    expect(settled[0]).toEqual({ status: 'fulfilled', value: 'a' });
    expect(settled[1]?.status).toBe('rejected');
    expect(settled[2]).toEqual({ status: 'fulfilled', value: 'c' });
  });
});
