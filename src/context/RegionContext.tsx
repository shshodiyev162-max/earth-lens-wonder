import { createContext, useContext, useState, ReactNode } from "react";
import { getDefaultDate } from "@/lib/map-layers";
import type { AreaMetric } from "@/lib/areaEstimator";

export type Region = {
  id: string;
  name: string;
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  center?: [number, number];
};

export type MapMode = "single" | "split" | "synced";

export type LayerInfo = {
  id: string;
  name: string;
  unit: string;
  cadence: "daily" | "weekly" | "monthly";
  description: string;
  supportsTime: boolean;
  colorScheme: string;
};

// Area selection type for drawing shapes on the map
export type SelectedArea = {
  id: string;
  name: string;
  type: "polygon" | "rectangle" | "circle";
  coordinates: [number, number][] | [number, number]; // polygon/rectangle points or circle center
  radius?: number; // for circle
  bounds: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  center: [number, number];
  areaKm2: number;
  greeneryIndex?: number;
  metrics?: AreaMetric[];
  createdAt: string;
};

interface RegionContextType {
  selectedRegion: Region;
  setSelectedRegion: (region: Region) => void;
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
  leftLayerId: string;
  setLeftLayerId: (id: string) => void;
  rightLayerId: string;
  setRightLayerId: (id: string) => void;
  leftDate: string;
  setLeftDate: (date: string) => void;
  rightDate: string;
  setRightDate: (date: string) => void;
  selectedAreas: SelectedArea[];
  addSelectedArea: (area: Omit<SelectedArea, "id" | "createdAt">) => void;
  removeSelectedArea: (id: string) => void;
  updateSelectedArea: (id: string, updates: Partial<SelectedArea>) => void;
  activeAreaId: string | null;
  setActiveAreaId: (id: string | null) => void;
}

const defaultRegion: Region = {
  id: "world",
  name: "World",
  bbox: null,
  center: [20, 0],
};

const RegionContext = createContext<RegionContextType | undefined>(undefined);

export function RegionProvider({ children }: { children: ReactNode }) {
  const [selectedRegion, setSelectedRegion] = useState<Region>(defaultRegion);
  const [mapMode, setMapMode] = useState<MapMode>("single");
  const [leftLayerId, setLeftLayerId] = useState("VIIRS_NOAA20_CorrectedReflectance_TrueColor");
  const [rightLayerId, setRightLayerId] = useState("MODIS_Terra_CorrectedReflectance_Bands721");
  
  // Start on dates that are normally available from near-real-time GIBS products.
  const [leftDate, setLeftDate] = useState(getDefaultDate);
  const [rightDate, setRightDate] = useState(() => {
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    return lastMonth.toISOString().split("T")[0]!;
  });

  // Selected areas state
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);

  const addSelectedArea = (area: Omit<SelectedArea, "id" | "createdAt">) => {
    const newArea: SelectedArea = {
      ...area,
      id: `area-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    setSelectedAreas(prev => [...prev, newArea]);
    setActiveAreaId(newArea.id);
  };

  const removeSelectedArea = (id: string) => {
    setSelectedAreas(prev => prev.filter(a => a.id !== id));
    if (activeAreaId === id) {
      setActiveAreaId(null);
    }
  };

  const updateSelectedArea = (id: string, updates: Partial<SelectedArea>) => {
    setSelectedAreas(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  return (
    <RegionContext.Provider
      value={{
        selectedRegion,
        setSelectedRegion,
        mapMode,
        setMapMode,
        leftLayerId,
        setLeftLayerId,
        rightLayerId,
        setRightLayerId,
        leftDate,
        setLeftDate,
        rightDate,
        setRightDate,
        selectedAreas,
        addSelectedArea,
        removeSelectedArea,
        updateSelectedArea,
        activeAreaId,
        setActiveAreaId,
      }}
    >
      {children}
    </RegionContext.Provider>
  );
}

export function useRegion() {
  const context = useContext(RegionContext);
  if (context === undefined) {
    throw new Error("useRegion must be used within a RegionProvider");
  }
  return context;
}


