import { withRetry } from '../retry.util';

describe('withRetry', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Connection terminated'))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rethrows the last error after exhausting attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('still down'));
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 0 }),
    ).rejects.toThrow('still down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('fails fast without retrying when shouldRetry returns false', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('AccessDenied'));
    await expect(
      withRetry(fn, { attempts: 4, baseDelayMs: 0, shouldRetry: () => false }),
    ).rejects.toThrow('AccessDenied');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries when shouldRetry returns true then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Premature close'))
      .mockResolvedValue('ok');
    await expect(
      withRetry(fn, { baseDelayMs: 0, shouldRetry: () => true }),
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
