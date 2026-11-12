import { describe, expect, it } from "vitest";
import { refForPart, withAddedParts, type TargetState } from "../useAnalysisTarget";
import type { ResolvedPartsState } from "../useResolvedParts";
import type { ResolvedPart } from "@/lib/areas/resolve";
import { areaKm2, bboxPolygon, type BBox } from "@/lib/geo/geometry";
import type { AnalysisTarget } from "@/lib/analysis/types";

const geometry = (bbox: BBox) => bboxPolygon(bbox);

const uzbekistan: AnalysisTarget = {
  name: "Uzbekistan",
  context: "Country",
  geometry: geometry([56, 37, 73, 46]),
  bbox: [56, 37, 73, 46],
  center: [41, 64],
  areaKm2: areaKm2(geometry([56, 37, 73, 46])),
  kind: "place",
  ref: { type: "country", id: "UZB" },
};

const part = (name: string, bbox: BBox): ResolvedPart => ({
  part: { kind: "bbox", bbox, name },
  key: `bbox:${bbox.join(",")}`,
  name,
  geometry: geometry(bbox),
  areaKm2: areaKm2(geometry(bbox)),
});

const ready = (target: AnalysisTarget | null, error: string | null = null): TargetState => ({ target, loading: false, error });
const added = (parts: (ResolvedPart | null)[], errors: string[] = [], loading = false): ResolvedPartsState => ({ parts, errors, loading });

describe("an area with places added to it", () => {
  it("is the first place alone when nothing was added", () => {
    expect(withAddedParts(ready(uzbekistan), added([]), { kind: "country", id: "UZB" })).toEqual(ready(uzbekistan));
  });

  it("waits until every place has loaded", () => {
    expect(withAddedParts(ready(uzbekistan), added([null], [], true), null)).toEqual({ target: null, loading: true, error: null });
  });

  it("reads the places as one, named together, with each one listed", () => {
    const turkmenistan = part("Turkmenistan box", [52, 35, 66, 43]);
    const { target } = withAddedParts(ready(uzbekistan), added([turkmenistan]), { kind: "country", id: "UZB" });
    expect(target).toMatchObject({ name: "Uzbekistan + Turkmenistan box", context: "2 places together", bbox: [52, 35, 73, 46], ref: { type: "country", id: "UZB" } });
    expect(target?.parts?.map((p) => [p.key, p.name])).toEqual([
      ["country:UZB", "Uzbekistan"],
      ["bbox:52,35,66,43", "Turkmenistan box"],
    ]);
    // The boxes overlap, so the area together is less than the two added up.
    expect(target?.areaKm2).toBeLessThan(uzbekistan.areaKm2 + turkmenistan.areaKm2);
    expect(target?.geometry.type).toBe("MultiPolygon");
  });

  it("keeps the places that loaded and says which didn't", () => {
    const state = withAddedParts(ready(uzbekistan), added([null], ["That saved area no longer exists on this device."]), null);
    expect(state.target).toBe(uzbekistan);
    expect(state.error).toBe("That saved area no longer exists on this device.");
  });

  it("works from added places alone, when no first place is given", () => {
    const state = withAddedParts(ready(null), added([part("Box", [0, 0, 1, 1])]), null);
    expect(state.target).toMatchObject({ name: "Box", kind: "drawn", ref: { type: "bbox", bbox: [0, 0, 1, 1] } });
    expect(state.target?.parts).toBeUndefined();
  });

  it("refers to a lone part the way the page always has", () => {
    expect(refForPart({ kind: "point", lat: 1, lon: 2, radiusKm: 5 })).toEqual({ type: "point", lat: 1, lon: 2, radiusKm: 5 });
    expect(refForPart({ kind: "region", label: "Aral Sea" })).toEqual({ type: "region", label: "Aral Sea" });
  });
});
