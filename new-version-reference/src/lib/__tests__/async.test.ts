import { describe, expect, it, vi } from "vitest";
import { createLimiter, createSharedCache, isAbortError } from "../async";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createSharedCache", () => {
  it("shares one request between callers and caches the result", async () => {
    const shared = createSharedCache<number>();
    const factory = vi.fn(async () => 42);
    const [a, b] = await Promise.all([shared("k", factory), shared("k", factory)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(await shared("k", factory)).toBe(42);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("keeps the request alive while another caller still waits", async () => {
    const shared = createSharedCache<number>();
    const gate = deferred<number>();
    let innerSignal: AbortSignal | null = null;
    const factory = (signal: AbortSignal) => {
      innerSignal = signal;
      return gate.promise;
    };
    const first = new AbortController();
    const p1 = shared("k", factory, first.signal);
    const p2 = shared("k", factory);
    first.abort();
    await expect(p1).rejects.toSatisfy(isAbortError);
    expect(innerSignal!.aborted).toBe(false);
    gate.resolve(7);
    await expect(p2).resolves.toBe(7);
  });

  it("cancels the request when every caller aborted", async () => {
    const shared = createSharedCache<number>();
    let innerSignal: AbortSignal | null = null;
    const factory = (signal: AbortSignal) => {
      innerSignal = signal;
      return new Promise<number>(() => undefined);
    };
    const controller = new AbortController();
    const p = shared("k", factory, controller.signal);
    controller.abort();
    await expect(p).rejects.toSatisfy(isAbortError);
    expect(innerSignal!.aborted).toBe(true);
  });

  it("does not cache failures", async () => {
    const shared = createSharedCache<number>();
    const factory = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(5);
    await expect(shared("k", factory)).rejects.toThrow("boom");
    await expect(shared("k", factory)).resolves.toBe(5);
  });
});

describe("createLimiter", () => {
  it("never runs more than the limit at once and skips aborted queued tasks", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return true;
      });
    const runs = [task(), task()]; // fill both slots
    const controller = new AbortController();
    const skipped = limit(async () => "ran", controller.signal).catch((error: unknown) => error); // queued
    runs.push(task(), task());
    controller.abort();
    await Promise.all(runs);
    expect(peak).toBeLessThanOrEqual(2);
    expect(isAbortError(await skipped)).toBe(true);
  });
});
