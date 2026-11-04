/** Runs async tasks with at most `limit` in flight. */
export function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= limit) return;
    const run = queue.shift();
    if (run) run();
  };

  return function schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        if (signal?.aborted) {
          // Cancelled while queued: never start it.
          reject(new DOMException("Aborted", "AbortError"));
          next();
          return;
        }
        active += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      };
      queue.push(run);
      next();
    });
  };
}

interface SharedEntry<T> {
  promise: Promise<T>;
  controller: AbortController;
  users: number;
  settled: boolean;
}

export function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

/**
 * De-duplicates identical requests across callers and caches successful
 * results. A request is only cancelled when every caller waiting on it has
 * aborted, so one cancelled analysis never breaks another that shares data.
 * With `forgetSettled`, finished results are not kept in memory (for large
 * values that the device cache already keeps).
 */
export function createSharedCache<T>(options: { forgetSettled?: boolean } = {}) {
  const cache = new Map<string, SharedEntry<T>>();

  return function shared(key: string, factory: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    let entry = cache.get(key);
    if (!entry) {
      const controller = new AbortController();
      const created: SharedEntry<T> = { controller, users: 0, settled: false, promise: Promise.resolve() as Promise<T> };
      created.promise = factory(controller.signal).then(
        (value) => {
          created.settled = true;
          if (options.forgetSettled && cache.get(key) === created) cache.delete(key);
          return value;
        },
        (error) => {
          created.settled = true;
          if (cache.get(key) === created) cache.delete(key);
          throw error;
        },
      );
      created.promise.catch(() => undefined);
      cache.set(key, created);
      entry = created;
    }
    const current = entry;
    current.users += 1;

    return new Promise<T>((resolve, reject) => {
      let done = false;
      const release = () => {
        if (done) return false;
        done = true;
        current.users -= 1;
        signal?.removeEventListener("abort", onAbort);
        return true;
      };
      const onAbort = () => {
        if (!release()) return;
        if (!current.settled && current.users <= 0) {
          current.controller.abort();
          if (cache.get(key) === current) cache.delete(key);
        }
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      current.promise.then(
        (value) => release() && resolve(value),
        (error) => release() && reject(error),
      );
    });
  };
}

export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

/** A request that took too long. Marked 504 so `withRetry` tries it again. */
export class TimeoutError extends Error {
  status = 504;
  constructor(message = "The NASA service took too long to answer") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * `fetch` with a time limit, so a stuck request ends in a clear error instead of an endless spinner.
 * Cancelling through `signal` still rejects with an AbortError, as usual.
 */
export async function fetchWithTimeout(url: string, options: { signal?: AbortSignal; timeoutMs?: number; init?: RequestInit } = {}): Promise<Response> {
  const { signal, timeoutMs = 25_000, init } = options;
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut && !signal?.aborted) throw new TimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Retries a request a few times on transient failures (network / 5xx). */
export async function withRetry<T>(task: () => Promise<T>, options: { retries?: number; signal?: AbortSignal; baseDelay?: number } = {}): Promise<T> {
  const retries = options.retries ?? 2;
  let attempt = 0;
  for (;;) {
    try {
      return await task();
    } catch (error) {
      const status = (error as { status?: number }).status;
      const retriable = !isAbortError(error) && (status === undefined || status >= 500 || status === 429);
      if (!retriable || attempt >= retries || options.signal?.aborted) throw error;
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, (options.baseDelay ?? 600) * attempt));
    }
  }
}
