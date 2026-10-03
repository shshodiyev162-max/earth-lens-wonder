import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { areaKm2, bboxOf, centroidOf, isPolygonGeometry, type BBox, type LatLng, type PolygonGeometry } from "@/lib/geo/geometry";
import { readJson, writeJson } from "@/lib/storage";

export type AreaKind = "rectangle" | "polygon" | "circle" | "place";

export interface SavedArea {
  id: string;
  name: string;
  kind: AreaKind;
  geometry: PolygonGeometry;
  bbox: BBox;
  center: LatLng;
  areaKm2: number;
  createdAt: string;
}

export interface MapView {
  center: LatLng;
  zoom: number;
}

interface WorkspaceValue {
  areas: SavedArea[];
  activeAreaId: string | null;
  setActiveAreaId: (id: string | null) => void;
  addArea: (input: { geometry: PolygonGeometry; kind: AreaKind; name?: string }) => SavedArea;
  renameArea: (id: string, name: string) => void;
  removeArea: (id: string) => void;
  clearAreas: () => void;
  getArea: (id: string | null | undefined) => SavedArea | undefined;
  /** Last map position, shared by Explore, Compare and Side-by-side. */
  view: MapView;
  setView: (view: MapView) => void;
}

const AREAS_KEY = "terravision.areas.v1";
const VIEW_KEY = "terravision.view.v1";
export const DEFAULT_VIEW: MapView = { center: [25, 20], zoom: 3 };

const WorkspaceContext = createContext<WorkspaceValue | undefined>(undefined);

function loadAreas(): SavedArea[] {
  const stored = readJson<unknown>(AREAS_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (item): item is SavedArea =>
      Boolean(item) && typeof item === "object" && typeof (item as SavedArea).id === "string" && isPolygonGeometry((item as SavedArea).geometry),
  );
}

function loadView(): MapView {
  const stored = readJson<MapView | null>(VIEW_KEY, null);
  if (
    stored &&
    Array.isArray(stored.center) &&
    stored.center.length === 2 &&
    stored.center.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    typeof stored.zoom === "number"
  ) {
    return stored;
  }
  return DEFAULT_VIEW;
}

function nextAreaName(areas: SavedArea[]): string {
  const used = new Set(areas.map((a) => a.name));
  let index = areas.length + 1;
  while (used.has(`Area ${index}`)) index += 1;
  return `Area ${index}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [areas, setAreas] = useState<SavedArea[]>(loadAreas);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [view, setViewState] = useState<MapView>(loadView);

  useEffect(() => writeJson(AREAS_KEY, areas), [areas]);

  const setView = useCallback((next: MapView) => {
    setViewState(next);
    writeJson(VIEW_KEY, next);
  }, []);

  const areasRef = useRef(areas);
  areasRef.current = areas;

  const addArea = useCallback<WorkspaceValue["addArea"]>((input) => {
    const area: SavedArea = {
      id: `area-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: input.name?.trim() || nextAreaName(areasRef.current),
      kind: input.kind,
      geometry: input.geometry,
      bbox: bboxOf(input.geometry),
      center: centroidOf(input.geometry),
      areaKm2: areaKm2(input.geometry),
      createdAt: new Date().toISOString(),
    };
    areasRef.current = [...areasRef.current, area];
    setAreas((previous) => [...previous, area]);
    setActiveAreaId(area.id);
    return area;
  }, []);

  const renameArea = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAreas((previous) => previous.map((area) => (area.id === id ? { ...area, name: trimmed } : area)));
  }, []);

  const removeArea = useCallback((id: string) => {
    setAreas((previous) => previous.filter((area) => area.id !== id));
    setActiveAreaId((current) => (current === id ? null : current));
  }, []);

  const clearAreas = useCallback(() => {
    setAreas([]);
    setActiveAreaId(null);
  }, []);

  const getArea = useCallback((id: string | null | undefined) => (id ? areas.find((area) => area.id === id) : undefined), [areas]);

  const value = useMemo<WorkspaceValue>(
    () => ({ areas, activeAreaId, setActiveAreaId, addArea, renameArea, removeArea, clearAreas, getArea, view, setView }),
    [areas, activeAreaId, addArea, renameArea, removeArea, clearAreas, getArea, view, setView],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return context;
}
