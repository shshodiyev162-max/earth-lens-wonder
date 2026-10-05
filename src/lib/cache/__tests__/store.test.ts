import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedValue, memoryBackend, readCache, setCacheBackend, writeCache, type CacheBackend } from "../store";
import { fetchWithTimeout, isAbortError, TimeoutError, withRetry } from "../../async";

afterEach(() => {
  setCacheBackend(null);
  vi.restoreAllMocks();
});

describe("persistent cache", () => {
  it("returns stored values until they expire", async () => {
    setCacheBackend(memoryBackend());
    await writeCache("grid:a", new Float32Array([1, 2, 3]), 1000, 0);
    expect(await readCache<Float32Array>("grid:a", 500)).toEqual(new Float32Array([1, 2, 3]));
    expect(await readCache("grid:a", 1500)).toBeUndefined();
    // The stale entry is gone for good.
    expect(await readCache("grid:a", 0)).toBeUndefined();
  });

  it("loads once and serves the cached copy afterwards", async () => {
    setCacheBackend(memoryBackend());
    const load = vi.fn(async () => ({ value: 42 }));
    expect(await cachedValue("series:x", 10_000, load)).toEqual({ value: 42 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await cachedValue("series:x", 10_000, load)).toEqual({ value: 42 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never caches a failure", async () => {
    setCacheBackend(memoryBackend());
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(7);
    await expect(cachedValue("series:y", 10_000, load)).rejects.toThrow("offline");
    expect(await cachedValue("series:y", 10_000, load)).toBe(7);
  });

  it("falls back to memory when the browser store fails", async () => {
    const broken: CacheBackend = {
      get: () => Promise.reject(new Error("quota")),
      set: () => Promise.reject(new Error("quota")),
      delete: () => Promise.reject(new Error("quota")),
    };
    setCacheBackend(broken);
    expect(await readCache("k")).toBeUndefined();
    await writeCache("k", "v", 10_000);
    expect(await readCache("k")).toBe("v");
  });
});

describe("fetchWithTimeout", () => {
  it("turns a stuck request into a TimeoutError that withRetry retries", async () => {
    const neverAnswers = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(neverAnswers as typeof fetch);
    const attempt = () => fetchWithTimeout("https://example.test", { timeoutMs: 10 });
    await expect(attempt()).rejects.toBeInstanceOf(TimeoutError);
    await expect(withRetry(attempt, { retries: 1, baseDelay: 1 })).rejects.toBeInstanceOf(TimeoutError);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("still reports a user cancel as an abort", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))) as typeof fetch);
    const controller = new AbortController();
    const pending = fetchWithTimeout("https://example.test", { signal: controller.signal, timeoutMs: 5000 });
    controller.abort();
    const error = await pending.catch((e) => e);
    expect(isAbortError(error)).toBe(true);
  });
});
