import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from './retry';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const promise = withRetry(fn, { maxRetries: 2 });
    const result = await promise;
    expect(result).toEqual({ ok: true, status: 200 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on network error and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100 });

    // Advance past the backoff delay
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toEqual({ ok: true, status: 200 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toEqual({ ok: true, status: 200 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 Too Many Requests', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toEqual({ ok: true, status: 200 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and returns last failed response', async () => {
    const failResponse = { ok: false, status: 503, statusText: 'Service Unavailable' };
    const fn = vi.fn().mockResolvedValue(failResponse);

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100 });

    // Advance through all retry delays
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual(failResponse);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does not retry on 400 Bad Request', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' });

    const result = await withRetry(fn, { maxRetries: 2 });
    expect(result).toEqual({ ok: false, status: 400, statusText: 'Bad Request' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 401 Unauthorized', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

    const result = await withRetry(fn, { maxRetries: 2 });
    expect(result).toEqual({ ok: false, status: 401, statusText: 'Unauthorized' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 403 Forbidden', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });

    const result = await withRetry(fn, { maxRetries: 2 });
    expect(result).toEqual({ ok: false, status: 403, statusText: 'Forbidden' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 404 Not Found', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    const result = await withRetry(fn, { maxRetries: 2 });
    expect(result).toEqual({ ok: false, status: 404, statusText: 'Not Found' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws network error after exhausting retries', async () => {
    vi.useRealTimers();
    const fn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow('Failed to fetch');
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useFakeTimers();
  });

  it('respects AbortSignal during backoff', async () => {
    vi.useRealTimers();
    const controller = new AbortController();
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 5000, signal: controller.signal });

    // Small delay to let the first attempt fail and enter backoff
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();

    await expect(promise).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
  });

  it('applies exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    // Use deterministic jitter by seeding Math.random
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0);

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 5000 });

    // First retry: baseDelay * 2^0 + 0 jitter = 100ms
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // Second retry: baseDelay * 2^1 + 0 jitter = 200ms
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    await promise;
    mockRandom.mockRestore();
  });
});
