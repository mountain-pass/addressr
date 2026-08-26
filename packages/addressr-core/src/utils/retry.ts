export interface RetryOptions {
  /** Maximum number of retries (default: 2, so 3 total attempts) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 500) */
  baseDelayMs?: number;
  /** Maximum delay in ms (default: 5000) */
  maxDelayMs?: number;
  /** AbortSignal to cancel retry during backoff */
  signal?: AbortSignal;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function isRetryable(response: { ok: boolean; status: number }): boolean {
  return !response.ok && RETRYABLE_STATUSES.has(response.status);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withRetry<T extends { ok: boolean; status: number }>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 2,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    signal,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (result.ok || !isRetryable(result)) {
        return result;
      }
      // Retryable HTTP error — continue to backoff
      if (attempt < maxRetries) {
        const jitter = Math.random() * baseDelayMs;
        const backoff = Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, maxDelayMs);
        await delay(backoff, signal);
      } else {
        return result; // Exhausted retries, return the failed response
      }
    } catch (err) {
      lastError = err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (attempt < maxRetries) {
        const jitter = Math.random() * baseDelayMs;
        const backoff = Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, maxDelayMs);
        await delay(backoff, signal);
      } else {
        throw err;
      }
    }
  }

  throw lastError;
}
