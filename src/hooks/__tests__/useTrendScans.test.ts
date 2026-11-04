import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTrendScans } from "../useTrendScans";
import { applyEdit, queryFromParams } from "@/lib/trends/query";
import { bboxPolygon } from "@/lib/geo/geometry";
import type { ScanRequest, ScanResult } from "@/lib/trends/scan";

const calls: string[] = [];
let hold: Promise<void> = Promise.resolve();

vi.mock("@/lib/trends/scan", async (original) => {
  const actual = (await original()) as object;
  return {
    ...actual,
    fetchAvailability: vi.fn(async () => ({ window: { earliest: "2000-03", latest: "2026-08" }, available: null })),
    nameHotspots: vi.fn(async () => undefined),
    runScan: vi.fn(async (request: ScanRequest) => {
      calls.push(request.indicator);
      await hold;
      if (request.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return { indicator: request.indicator, hotspots: [], plan: request.plan } as unknown as ScanResult;
    }),
  };
});

vi.mock("@/lib/trends/place", async (original) => {
  const actual = (await original()) as object;
  return {
    ...actual,
    resolveArea: vi.fn(async (place: string) => ({ name: place, geometry: bboxPolygon([56, 37, 73, 46]), bbox: [56, 37, 73, 46], center: [41, 64], kind: "country" })),
  };
});

const query = queryFromParams(new URLSearchParams({ q: "vegetation and rainfall decline in Uzbekistan since 2015" }));

describe("useTrendScans", () => {
  beforeEach(() => {
    calls.length = 0;
    hold = Promise.resolve();
  });

  it("scans each measure in turn and fills in their results", async () => {
    const { result } = renderHook(() => useTrendScans(query, null));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(calls).toEqual(["vegetation", "rainfall"]);
    expect(result.current.measures.vegetation?.status).toBe("done");
    expect(result.current.measures.rainfall?.status).toBe("done");
    expect(result.current.area?.name).toBe("Uzbekistan");
    expect(result.current.totalMaps).toBeGreaterThan(0);
  });

  it("doesn't scan again when only the filters change", async () => {
    const { result, rerender } = renderHook(({ q }) => useTrendScans(q, null), { initialProps: { q: query } });
    await waitFor(() => expect(result.current.status).toBe("done"));
    rerender({ q: applyEdit(query, { filters: { ...query.filters, vegetation: { direction: "any", minFactor: 3, minAreaKm2: 100, strict: true } } }) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual(["vegetation", "rainfall"]);
  });

  it("stops every measure that hasn't finished", async () => {
    let release: () => void = () => undefined;
    hold = new Promise((resolve) => (release = resolve));
    const { result } = renderHook(() => useTrendScans(query, null));
    await waitFor(() => expect(result.current.measures.vegetation?.status).toBe("scanning"));
    act(() => result.current.cancel());
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.measures.vegetation?.status).toBe("stopped");
    expect(result.current.measures.rainfall?.status).toBe("stopped");
    expect(calls).toEqual(["vegetation"]);
  });
});
