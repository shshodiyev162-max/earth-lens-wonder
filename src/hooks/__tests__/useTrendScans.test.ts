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
    resolveArea: vi.fn(async (place: string) => ({
      name: place,
      geometry: bboxPolygon([56, 37, 73, 46]),
      bbox: [56, 37, 73, 46],
      center: [41, 64],
      kind: "country",
      water: /atlantic/i.test(place) ? "ocean" : undefined,
    })),
  };
});

let coverShares: Record<string, number> | null = null;

vi.mock("@/lib/trends/landcover", async (original) => {
  const actual = (await original()) as typeof import("@/lib/trends/landcover");
  return {
    ...actual,
    fetchLandCover: vi.fn(async () => {
      if (!coverShares) throw new Error("NASA land cover didn't answer");
      const shares = Object.fromEntries(actual.COVER_GROUPS.map((g) => [g, coverShares?.[g] ?? 0]));
      return { year: 2024, shares, km2: shares, totalKm2: 1 };
    }),
  };
});

const query = queryFromParams(new URLSearchParams({ q: "vegetation and rainfall decline in Uzbekistan since 2015" }));

describe("useTrendScans", () => {
  beforeEach(() => {
    calls.length = 0;
    hold = Promise.resolve();
    coverShares = null;
  });

  it("scans the measures that suit the place for 'what changed'", async () => {
    coverShares = { barren: 0.7, grass: 0.3 };
    const everything = queryFromParams(new URLSearchParams({ q: "what changed in Uzbekistan" }));
    expect(everything.everything).toBe(true);
    const { result } = renderHook(() => useTrendScans(everything, null));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.indicators).toEqual(["dust", "vegetation", "heat", "rainfall", "soil"]);
    expect(calls).toEqual(["dust", "vegetation", "heat", "rainfall", "soil"]);
    expect(result.current.cover?.shares.barren).toBe(0.7);
  });

  it("says straight away when a measure can't be read in the place, and scans the rest", async () => {
    const ocean = queryFromParams(new URLSearchParams({ ind: "vegetation,sst", place: "North Atlantic", t: "default", season: "usual" }));
    const { result } = renderHook(() => useTrendScans(ocean, null));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(calls).toEqual(["sst"]);
    expect(result.current.measures.vegetation).toMatchObject({ status: "error", wrongPlace: true });
    expect(result.current.measures.vegetation?.error).toMatch(/open ocean/);
    expect(result.current.measures.sst?.status).toBe("done");
  });

  it("falls back to the six main measures when land cover can't be read", async () => {
    const everything = queryFromParams(new URLSearchParams({ q: "what changed in Uzbekistan" }));
    const { result } = renderHook(() => useTrendScans(everything, null));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.indicators).toEqual(["vegetation", "heat", "rainfall", "soil", "dust", "snow"]);
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
