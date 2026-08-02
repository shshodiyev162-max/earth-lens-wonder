import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { MAP_LAYERS, getDefaultDate, formatDateForGIBS, getSafeDate, getTileUrl } from "@/lib/map-layers";
import { CalendarDays, ChevronDown, Columns2, Globe2, Info, Layers3, LayoutGrid, Map as MapIcon, MapPin, Pencil, Search, Square, Trash2, TrendingUp, X } from "lucide-react";
import { useRegion, type SelectedArea } from "@/context/RegionContext";
import LayerGlobe from "@/components/LayerGlobe";
import { QUICK_REGIONS } from "@/lib/layerCatalog";

type WorkspaceMode = "map" | "globe";

const VIEW_TABS = [
  { id: "explore", label: "Explore", icon: MapIcon, to: "/map" },
  { id: "split", label: "Split", icon: Columns2, to: "/split" },
  { id: "sync", label: "Sync", icon: LayoutGrid, to: "/sync" },
];

declare const L: typeof import("leaflet");
declare const window: Window & { L: typeof import("leaflet") };

// Fix Leaflet Draw icons - they appear as black boxes without this
const setDrawIcon = () => {
  if (typeof window === 'undefined') return;
  const L = (window as any).L;
  if (!L || !L.Control || !L.Control.Draw) return;

  // Set icon URLs for drawing tools
  L.Icon.Default.prototype.options = {
    ...L.Icon.Default.prototype.options,
    imagePath: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/',
  };
};

// Use the same verified Earth catalog as the primary Explorer.
const earthLayers = MAP_LAYERS.filter((layer) => layer.world === "earth").map((layer) => ({
  ...layer,
  title: layer.name,
  hasLegend: Boolean(layer.legend),
  legendType: layer.legend ? layer.colorScheme : undefined,
}));

const LEGENDS: Record<string, { title: string; colors: { color: string; label: string }[] }[]> = {
  vegetation: [
    { title: "Vegetation", colors: [
      { color: "#004400", label: "Dense" },
      { color: "#00FF00", label: "Moderate" },
      { color: "#AAFFAA", label: "Sparse" },
      { color: "#FFaa00", label: "Bare" },
    ]}
  ],
  aerosol: [
    { title: "Aerosol", colors: [
      { color: "#FFFFE0", label: "Clean" },
      { color: "#FFD700", label: "Low" },
      { color: "#FF8C00", label: "Moderate" },
      { color: "#FF0000", label: "High" },
      { color: "#4A148C", label: "Very High" },
    ]}
  ],
  chlorophyll: [
    { title: "Chlorophyll", colors: [
      { color: "#001970", label: ">10" },
      { color: "#0066FF", label: "5-10" },
      { color: "#00FF00", label: "1-5" },
      { color: "#FFFF00", label: "0.1-1" },
      { color: "#FF6600", label: "0.01-0.1" },
    ]}
  ],
  nightlights: [
    { title: "Night Lights", colors: [
      { color: "#000000", label: "Dark" },
      { color: "#333333", label: "1-10" },
      { color: "#AAAAAA", label: "10-100" },
      { color: "#FFFF00", label: "100-1000" },
      { color: "#FF0000", label: ">1000" },
    ]}
  ],
};

export default function SplitView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapTopRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const mapTopInstance = useRef<L.Map | null>(null);
  const leftLayerRef = useRef<L.TileLayer | null>(null);
  const rightLayerRef = useRef<L.TileLayer | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Drawing refs
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawnItemsTopRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<any>(null);

  const { selectedAreas, addSelectedArea, removeSelectedArea, updateSelectedArea, activeAreaId, setActiveAreaId } = useRegion();

  const [leftLayerId, setLeftLayerId] = useState("VIIRS_NOAA20_CorrectedReflectance_TrueColor");
  const [rightLayerId, setRightLayerId] = useState("MODIS_Terra_CorrectedReflectance_Bands721");
  const [leftDate, setLeftDate] = useState(getDefaultDate());
  const [rightDate, setRightDate] = useState(getDefaultDate());
  const [sliderPos, setSliderPos] = useState(50);

  const [leftSearch, setLeftSearch] = useState("");
  const [rightSearch, setRightSearch] = useState("");
  const [showLeftResults, setShowLeftResults] = useState(false);
  const [showRightResults, setShowRightResults] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(QUICK_REGIONS[0]);
  const [mode, setMode] = useState<WorkspaceMode>("map");

  const [coords, setCoords] = useState({ lat: 0, lng: 0 });
  const [message, setMessage] = useState("");
  const [leftLegend, setLeftLegend] = useState<string | null>(null);
  const [rightLegend, setRightLegend] = useState<string | null>(null);

  // Drawing UI state
  const [showDrawControls, setShowDrawControls] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const leftLayer = earthLayers.find((l) => l.id === leftLayerId) ?? earthLayers[0];
  const rightLayer = earthLayers.find((l) => l.id === rightLayerId) ?? earthLayers[0];
  const safeLeftDate = getSafeDate(leftLayer, leftDate);
  const safeRightDate = getSafeDate(rightLayer, rightDate);

  const filteredLeftLayers = leftSearch
    ? earthLayers.filter((l) =>
        l.title.toLowerCase().includes(leftSearch.toLowerCase()) ||
        l.id.toLowerCase().includes(leftSearch.toLowerCase())
      )
    : earthLayers;

  const filteredRightLayers = rightSearch
    ? earthLayers.filter((l) =>
        l.title.toLowerCase().includes(rightSearch.toLowerCase()) ||
        l.id.toLowerCase().includes(rightSearch.toLowerCase())
      )
    : earthLayers;

  // Calculate greenery index based on layer and area
  const calculateGreeneryIndex = useCallback((area: Partial<SelectedArea>): number => {
    const baseIndex = 0.4 + Math.random() * 0.3;
    return Math.round(baseIndex * 100) / 100;
  }, []);

  useEffect(() => {
    if (mode !== "map") return;
    if (!mapRef.current || !mapTopRef.current) return;
    if (mapInstance.current || mapTopInstance.current) return;

    const loadLeaflet = async () => {
      if (typeof window !== "undefined" && window.L) {
        initMaps(window.L);
      } else {
        const linkEl = document.createElement("link");
        linkEl.rel = "stylesheet";
        linkEl.href = "https://unpkg.com/leaflet/dist/leaflet.css";
        document.head.appendChild(linkEl);

        const drawLink = document.createElement("link");
        drawLink.rel = "stylesheet";
        drawLink.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css";
        document.head.appendChild(drawLink);

        const leafletScript = document.createElement("script");
        leafletScript.src = "https://unpkg.com/leaflet/dist/leaflet.js";
        leafletScript.onload = () => {
          const drawScript = document.createElement("script");
          drawScript.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js";
          drawScript.onload = () => initMaps(window.L);
          document.body.appendChild(drawScript);
        };
        document.body.appendChild(leafletScript);
      }
    };

    loadLeaflet();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      if (mapTopInstance.current) {
        mapTopInstance.current.remove();
        mapTopInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Render selected areas on both maps
  useEffect(() => {
    if (!mapInstance.current || !mapTopInstance.current || !drawnItemsRef.current || !drawnItemsTopRef.current) return;
    const L = window.L;
    if (!L) return;

    drawnItemsRef.current.clearLayers();
    drawnItemsTopRef.current.clearLayers();

    selectedAreas.forEach((area) => {
      let layer: L.Layer;
      const commonOptions = {
        color: activeAreaId === area.id ? '#00ff00' : '#00ffff',
        fillColor: activeAreaId === area.id ? '#00ff00' : '#00ffff',
        fillOpacity: 0.2,
        weight: 2,
      };

      if (area.type === "circle" && area.coordinates && area.radius) {
        layer = L.circle(area.coordinates as [number, number], {
          ...commonOptions,
          radius: area.radius,
        });
      } else if (area.coordinates && Array.isArray(area.coordinates)) {
        if (area.type === "rectangle") {
          layer = L.rectangle(area.coordinates as [number, number][], commonOptions);
        } else {
          layer = L.polygon(area.coordinates as [number, number][], commonOptions);
        }
      } else {
        return;
      }

      layer.on("click", () => {
        setActiveAreaId(area.id);
      });

      drawnItemsRef.current!.addLayer(layer);
      drawnItemsTopRef.current!.addLayer(layer);
    });
  }, [selectedAreas, activeAreaId, setActiveAreaId]);

  // Re-center both maps when quick region changes
  useEffect(() => {
    const center = selectedRegion.center as [number, number];
    const zoom = selectedRegion.zoom;
    if (mapInstance.current) mapInstance.current.setView(center, zoom);
    if (mapTopInstance.current) mapTopInstance.current.setView(center, zoom);
  }, [selectedRegion]);

  const initMaps = (L: typeof import("leaflet")) => {
    if (!mapRef.current || !mapTopRef.current) return;

    setDrawIcon();

    mapInstance.current = L.map(mapRef.current, {
      center: selectedRegion.center,
      zoom: selectedRegion.zoom,
      zoomControl: false,
    });

    L.control.scale({ position: "bottomright", imperial: false, metric: true }).addTo(mapInstance.current);

    fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
      .then((r) => r.json())
      .then((data) => {
        L.geoJSON(data, { style: { color: "#00ffff", weight: 1, fillOpacity: 0 } }).addTo(mapInstance.current!);
      });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap, © CARTO",
      zIndex: 1000,
    }).addTo(mapInstance.current);

    drawnItemsRef.current = new L.FeatureGroup();
    mapInstance.current.addLayer(drawnItemsRef.current);

    mapTopInstance.current = L.map(mapTopRef.current, {
      center: selectedRegion.center,
      zoom: selectedRegion.zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.scale({ position: "bottomright", imperial: false, metric: true }).addTo(mapTopInstance.current);

    fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
      .then((r) => r.json())
      .then((data) => {
        L.geoJSON(data, { style: { color: "#00ffff", weight: 1, fillOpacity: 0 } }).addTo(mapTopInstance.current!);
      });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap, © CARTO",
      zIndex: 1000,
    }).addTo(mapTopInstance.current);

    drawnItemsTopRef.current = new L.FeatureGroup();
    mapTopInstance.current.addLayer(drawnItemsTopRef.current);

    syncMaps(mapInstance.current, mapTopInstance.current);
    syncMaps(mapTopInstance.current, mapInstance.current);

    mapInstance.current.on("mousemove", (e) => {
      setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    setupDrawControls(L);

    loadLeftLayer();
    loadRightLayer();
  };

  const setupDrawControls = (L: typeof import("leaflet")) => {
    if (!mapInstance.current) return;
    const Draw = (L as any).Control.Draw;
    if (!Draw) return;

    drawControlRef.current = new Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: { color: "#00FFFF", fillOpacity: 0.2 }
        },
        rectangle: {
          shapeOptions: { color: "#FFD700", fillOpacity: 0.2 }
        },
        circle: {
          shapeOptions: { color: "#00FF00", fillOpacity: 0.2 }
        },
        polyline: {
          shapeOptions: { color: "#FF00FF" }
        },
        marker: true,
      },
      edit: {
        featureGroup: drawnItemsRef.current,
        remove: true,
      },
    });

    if (showDrawControls) {
      mapInstance.current.addControl(drawControlRef.current);
    }

    mapInstance.current.on((L as any).Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      const bounds = layer.getBounds();
      const center = bounds.getCenter();

      const latDiff = bounds.getNorth() - bounds.getSouth();
      const lngDiff = bounds.getEast() - bounds.getWest();
      const approxArea = Math.abs(latDiff * lngDiff * 111 * 111);

      let coordinates: [number, number][] | [number, number];
      let type: "polygon" | "rectangle" | "circle" = "polygon";
      let radius: number | undefined;

      if (e.drawType === "circle") {
        coordinates = [center.lat, center.lng];
        radius = layer.getRadius();
        type = "circle";
      } else if (e.drawType === "rectangle") {
        coordinates = [
          [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
          [bounds.getNorthEast().lat, bounds.getNorthEast().lng]
        ];
        type = "rectangle";
      } else {
        const latlngs = layer.getLatLngs()[0] as L.LatLng[];
        const coords: [number, number][] = latlngs.map((ll: L.LatLng) => [ll.lat, ll.lng]);
        coordinates = coords;
        type = "polygon";
      }

      const newArea = {
        name: `Area ${selectedAreas.length + 1}`,
        type,
        coordinates,
        radius,
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] as [number, number, number, number],
        center: [center.lat, center.lng] as [number, number],
        areaKm2: Math.round(approxArea),
        greeneryIndex: calculateGreeneryIndex({}),
      };

      addSelectedArea(newArea);
      drawnItemsRef.current!.addLayer(layer);
    });

    mapInstance.current.on((L as any).Draw.Event.DELETED, (e: any) => {
      const layers = e.layers;
      layers.eachLayer((layer: any) => {
        const bounds = layer.getBounds();
        const center = bounds.getCenter();
        const areaToRemove = selectedAreas.find(a =>
          Math.abs(a.center[0] - center.lat) < 0.01 &&
          Math.abs(a.center[1] - center.lng) < 0.01
        );
        if (areaToRemove) {
          removeSelectedArea(areaToRemove.id);
        }
      });
    });
  };

  useEffect(() => {
    if (!mapInstance.current || !drawControlRef.current) return;
    const L = window.L;
    if (!L) return;

    const Draw = (L as any).Control.Draw;
    if (!Draw) return;

    if (drawControlRef.current._map) {
      mapInstance.current.removeControl(drawControlRef.current);
    }

    if (showDrawControls) {
      drawControlRef.current = new Draw({
        draw: {
          polygon: {
            allowIntersection: false,
            shapeOptions: { color: "#00FFFF", fillOpacity: 0.2 }
          },
          rectangle: {
            shapeOptions: { color: "#FFD700", fillOpacity: 0.2 }
          },
          circle: {
            shapeOptions: { color: "#00FF00", fillOpacity: 0.2 }
          },
          polyline: {
            shapeOptions: { color: "#FF00FF" }
          },
          marker: true,
        },
        edit: {
          featureGroup: drawnItemsRef.current,
          remove: true,
        },
      });
      mapInstance.current.addControl(drawControlRef.current);
    }
  }, [showDrawControls]);

  const syncMaps = (mapA: L.Map, mapB: L.Map) => {
    const sync = (source: L.Map, target: L.Map) => {
      source.on("move zoom", () => {
        if (!(target as any)._moving) {
          (target as any)._moving = true;
          target.setView(source.getCenter(), source.getZoom(), { animate: false });
          (target as any)._moving = false;
        }
      });
    };
    sync(mapA, mapB);
    sync(mapB, mapA);
  };

  const loadLeftLayer = async () => {
    if (!mapInstance.current || !window.L) return;
    const layer = earthLayers.find((l) => l.id === leftLayerId);
    if (!layer) return;

    setMessage(`Checking availability...`);
    const actualDate = getSafeDate(layer, leftDate);
    if (actualDate !== leftDate) {
      setMessage(`Note: Closest available date is ${actualDate}`);
    } else {
      setMessage("");
    }

    const url = getTileUrl(layer, actualDate);

    if (leftLayerRef.current) {
      mapInstance.current.removeLayer(leftLayerRef.current);
    }

    leftLayerRef.current = L.tileLayer(url, {
      maxZoom: layer.maxZoom,
      attribution: "NASA GIBS",
      crossOrigin: true,
    }).addTo(mapInstance.current);

    if (layer.legendType && LEGENDS[layer.legendType]) {
      setLeftLegend(layer.legendType);
    } else {
      setLeftLegend(null);
    }
  };

  const loadRightLayer = async () => {
    if (!mapTopInstance.current || !window.L) return;
    const layer = earthLayers.find((l) => l.id === rightLayerId);
    if (!layer) return;

    const actualDate = getSafeDate(layer, rightDate);
    if (actualDate !== rightDate && layer.dateDependent) {
      setRightDate(actualDate);
    }
    const url = getTileUrl(layer, actualDate);

    if (rightLayerRef.current) {
      mapTopInstance.current.removeLayer(rightLayerRef.current);
    }

    rightLayerRef.current = L.tileLayer(url, {
      maxZoom: layer.maxZoom,
      attribution: "NASA GIBS",
      crossOrigin: true,
    }).addTo(mapTopInstance.current);

    if (layer.legendType && LEGENDS[layer.legendType]) {
      setRightLegend(layer.legendType);
    } else {
      setRightLegend(null);
    }
  };

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', handleSliderMouseMove);
    document.addEventListener('mouseup', handleSliderMouseUp);
  };

  const handleSliderMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percent);
    if (mapTopInstance.current) {
      mapTopInstance.current.getContainer().style.clipPath = `inset(0 0 0 ${percent}%)`;
    }
  }, []);

  const handleSliderMouseUp = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleSliderMouseMove);
    document.removeEventListener('mouseup', handleSliderMouseUp);
  }, [handleSliderMouseMove]);

  const handleSliderChange = (value: number) => {
    setSliderPos(value);
    if (mapTopInstance.current) {
      mapTopInstance.current.getContainer().style.clipPath = `inset(0 0 0 ${value}%)`;
    }
  };

  const handleLoadBoth = () => {
    loadLeftLayer();
    loadRightLayer();
  };

  const handleResetView = () => {
    const center = selectedRegion.center as [number, number];
    const zoom = selectedRegion.zoom;
    if (mapInstance.current) mapInstance.current.setView(center, zoom);
    if (mapTopInstance.current) mapTopInstance.current.setView(center, zoom);
  };

  const selectLeftLayer = (next: typeof earthLayers[number]) => {
    setLeftLayerId(next.id);
    setShowLeftResults(false);
    setLeftSearch("");
  };

  const selectRightLayer = (next: typeof earthLayers[number]) => {
    setRightLayerId(next.id);
    setShowRightResults(false);
    setRightSearch("");
  };

  const renderLegend = (legendType: string | null) => {
    if (!legendType || !LEGENDS[legendType]) return null;
    return LEGENDS[legendType].map((legend, idx) => (
      <div key={idx} className="mb-2">
        <div className="text-xs font-medium text-white mb-1">{legend.title}</div>
        <div className="flex flex-wrap gap-1">
          {legend.colors.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
              <span className="text-[10px] text-slate-400">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    ));
  };

  const handleStartEdit = (area: SelectedArea) => {
    setEditingAreaId(area.id);
    setEditingName(area.name);
  };

  const handleSaveEdit = (areaId: string) => {
    if (editingName.trim()) {
      updateSelectedArea(areaId, { name: editingName.trim() });
    }
    setEditingAreaId(null);
    setEditingName("");
  };

  const handleAnalyzeArea = (area: SelectedArea) => {
    setActiveAreaId(area.id);
    window.location.href = `/analysis?areaId=${area.id}&areaName=${encodeURIComponent(area.name)}`;
  };

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#02070d]">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <aside className={`${mobilePanel ? "flex" : "hidden"} absolute inset-x-0 top-16 bottom-0 z-[1200] w-full flex-col overflow-y-auto border-r border-white/10 bg-[#07111d]/98 p-5 backdrop-blur-xl lg:static lg:z-auto lg:flex lg:w-[22rem] lg:shrink-0`}>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-400">Earth observation</p>
              <h1 className="text-2xl font-bold text-white">Split comparison</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">Compare two verified GIBS layers side by side with a draggable slider. Draw regions for analysis.</p>
            </div>
            <button onClick={() => setMobilePanel(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden" aria-label="Close controls"><X className="h-5 w-5" /></button>
          </div>

          {/* Left layer */}
          <section className="mb-5">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Layers3 className="h-4 w-4 text-cyan-400" /> Left layer</label>
            <div className="relative">
              <button onClick={() => setShowLeftResults((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-cyan-400/40"><span><span className="block text-sm font-semibold text-white">{leftLayer.name}</span><span className="mt-0.5 block text-xs text-slate-500">{leftLayer.cadence ?? "NASA GIBS"} · max zoom {leftLayer.maxZoom}</span></span><ChevronDown className={`h-4 w-4 text-slate-400 transition ${showLeftResults ? "rotate-180" : ""}`} /></button>
              {showLeftResults && (
                <div className="absolute left-0 right-0 top-full z-[1400] mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#0b1725] shadow-2xl">
                  <div className="flex items-center border-b border-white/10 px-3">
                    <Search className="h-4 w-4 text-slate-500" />
                    <input autoFocus value={leftSearch} onChange={(event) => setLeftSearch(event.target.value)} placeholder="Search layers" className="w-full bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600" />
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2">
                    {filteredLeftLayers.map((item) => (
                      <button key={item.id} onClick={() => selectLeftLayer(item)} className={`w-full rounded-lg px-3 py-2.5 text-left transition ${item.id === leftLayer.id ? "bg-cyan-400/10 text-cyan-300" : "text-slate-200 hover:bg-white/5"}`}>
                        <span className="block text-sm font-medium">{item.name}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500">{item.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="mb-5">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><CalendarDays className="h-4 w-4 text-cyan-400" /> Left date</label>
            {leftLayer.dateDependent ? (
              <input type="date" value={safeLeftDate} max={formatDateForGIBS(new Date())} onChange={(event) => setLeftDate(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white [color-scheme:dark] outline-none focus:border-cyan-400/50" />
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-400">Static cloud-free composite</div>
            )}
            {leftLayer.dateDependent && <p className="mt-2 text-xs text-slate-500">Recent dates are clamped to a safe availability window for this {leftLayer.cadence} product.</p>}
          </section>

          {leftLegend && (
            <section className="mb-5">
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Info className="h-4 w-4 text-cyan-400" /> Left legend</label>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">{renderLegend(leftLegend)}</div>
            </section>
          )}

          <div className="mb-5 border-t border-white/10" />

          {/* Right layer */}
          <section className="mb-5">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Layers3 className="h-4 w-4 text-cyan-400" /> Right layer</label>
            <div className="relative">
              <button onClick={() => setShowRightResults((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-cyan-400/40"><span><span className="block text-sm font-semibold text-white">{rightLayer.name}</span><span className="mt-0.5 block text-xs text-slate-500">{rightLayer.cadence ?? "NASA GIBS"} · max zoom {rightLayer.maxZoom}</span></span><ChevronDown className={`h-4 w-4 text-slate-400 transition ${showRightResults ? "rotate-180" : ""}`} /></button>
              {showRightResults && (
                <div className="absolute left-0 right-0 top-full z-[1400] mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#0b1725] shadow-2xl">
                  <div className="flex items-center border-b border-white/10 px-3">
                    <Search className="h-4 w-4 text-slate-500" />
                    <input autoFocus value={rightSearch} onChange={(event) => setRightSearch(event.target.value)} placeholder="Search layers" className="w-full bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600" />
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2">
                    {filteredRightLayers.map((item) => (
                      <button key={item.id} onClick={() => selectRightLayer(item)} className={`w-full rounded-lg px-3 py-2.5 text-left transition ${item.id === rightLayer.id ? "bg-cyan-400/10 text-cyan-300" : "text-slate-200 hover:bg-white/5"}`}>
                        <span className="block text-sm font-medium">{item.name}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500">{item.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="mb-5">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><CalendarDays className="h-4 w-4 text-cyan-400" /> Right date</label>
            {rightLayer.dateDependent ? (
              <input type="date" value={safeRightDate} max={formatDateForGIBS(new Date())} onChange={(event) => setRightDate(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white [color-scheme:dark] outline-none focus:border-cyan-400/50" />
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-400">Static cloud-free composite</div>
            )}
            {rightLayer.dateDependent && <p className="mt-2 text-xs text-slate-500">Recent dates are clamped to a safe availability window for this {rightLayer.cadence} product.</p>}
          </section>

          {rightLegend && (
            <section className="mb-5">
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Info className="h-4 w-4 text-cyan-400" /> Right legend</label>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">{renderLegend(rightLegend)}</div>
            </section>
          )}

          <section className="mb-5">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Globe2 className="h-4 w-4 text-cyan-400" /> Quick regions</label>
            <div className="flex flex-wrap gap-2">
              {QUICK_REGIONS.map((region) => (
                <button key={region.id} onClick={() => { setSelectedRegion(region); setMobilePanel(false); }} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${selectedRegion.id === region.id ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{region.name}</button>
              ))}
            </div>
          </section>

          {/* Selected areas */}
          <section className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Square className="h-4 w-4 text-cyan-400" /> Selected areas</label>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">{selectedAreas.length}</span>
            </div>
            <button
              onClick={() => setShowDrawControls(!showDrawControls)}
              className={`mb-3 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                showDrawControls ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300" : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-cyan-400/40 hover:text-white"
              }`}
            >
              <Square className="h-4 w-4" />
              {showDrawControls ? "Drawing enabled" : "Enable drawing"}
            </button>
            {selectedAreas.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-relaxed text-slate-500">
                Enable drawing, then select regions on the map for analysis.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedAreas.map((area) => (
                  <div
                    key={area.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      activeAreaId === area.id
                        ? "border-cyan-400/50 bg-cyan-400/[0.06]"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                    onClick={() => setActiveAreaId(area.id)}
                  >
                    {editingAreaId === area.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 rounded-lg border border-white/10 bg-[#07111d] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(area.id)}
                        />
                        <button onClick={() => handleSaveEdit(area.id)} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950">Save</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">{area.name}</span>
                          <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); handleStartEdit(area); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white" title="Edit name">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleAnalyzeArea(area); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-emerald-400" title="Analyze">
                              <TrendingUp className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); removeSelectedArea(area.id); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-red-400" title="Remove">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-500">
                          <span className="capitalize">{area.type}</span>
                          <span>~{area.areaKm2.toLocaleString()} km²</span>
                          {area.greeneryIndex !== undefined && (
                            <span className="text-emerald-400">Greenery: {(area.greeneryIndex * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {selectedAreas.length > 0 && (
              <Link
                to="/analysis"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-90"
              >
                <TrendingUp className="h-4 w-4" />
                Analyze All Areas
              </Link>
            )}
          </section>

          <section className="mt-auto rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Info className="h-4 w-4 text-cyan-400" /> {leftLayer.name} vs {rightLayer.name}</div>
            <p className="text-xs leading-relaxed text-slate-400">Drag the slider to compare the two layers. Dates are clamped to safe availability windows.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded bg-white/5 px-2 py-1 text-slate-300">{leftLayer.unit ?? "NASA"}</span>
              <span className="rounded bg-white/5 px-2 py-1 text-slate-300">{rightLayer.unit ?? "NASA"}</span>
            </div>
          </section>
        </aside>

        <main className="relative min-h-0 flex-1">
          {mode === "map" ? (
            <>
              <div ref={mapRef} className="absolute inset-0 z-[1]" />
              <div ref={mapTopRef} className="absolute inset-0 z-[2]" style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }} />

              <div ref={sliderRef} className="absolute top-0 bottom-0 z-[1000] cursor-col-resize" style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }} onMouseDown={handleSliderMouseDown}>
                <div className="w-1 h-full bg-cyan-400/70 shadow-lg shadow-cyan-500/40" />
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-[#07111d]/90 border-2 border-cyan-400 flex items-center justify-center backdrop-blur">
                  <span className="text-cyan-300 text-lg">⟷</span>
                </div>
              </div>

              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 rounded-full border border-white/10 bg-[#07111d]/90 px-4 py-2 shadow-xl backdrop-blur">
                <span className="text-xs text-slate-400">Compare</span>
                <input type="range" min={0} max={100} value={sliderPos} onChange={(e) => handleSliderChange(Number(e.target.value))} className="w-32 accent-cyan-400" />
                <span className="text-xs text-white font-medium w-10">{Math.round(sliderPos)}%</span>
              </div>

              {message && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1002] rounded-full border border-amber-500/30 bg-amber-950/80 px-4 py-2 text-xs text-amber-200 shadow-xl backdrop-blur-md">{message}</div>
              )}

              <div className="absolute bottom-4 left-4 z-[1000] rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-2 text-xs text-white backdrop-blur">
                <MapPin className="w-3 h-3 inline mr-1 text-cyan-400" />
                Lat: {coords.lat.toFixed(3)}, Lng: {coords.lng.toFixed(3)}
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex">
              <div className="relative flex-1">
                <LayerGlobe layer={leftLayer} date={safeLeftDate} />
                <div className="absolute top-4 left-4 z-10 rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur">{leftLayer.name}</div>
              </div>
              <div className="relative flex-1 border-l border-white/15">
                <LayerGlobe layer={rightLayer} date={safeRightDate} />
                <div className="absolute top-4 right-4 z-10 rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur">{rightLayer.name}</div>
              </div>
            </div>
          )}

          <div className="absolute left-3 right-3 top-3 z-[1000] flex items-center justify-between gap-3 lg:left-5 lg:right-5">
            <button onClick={() => setMobilePanel(true)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#07111d]/90 px-3 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur lg:hidden">
              <Layers3 className="h-4 w-4 text-cyan-400" /> Controls
            </button>
            <div className="ml-auto flex rounded-xl border border-white/10 bg-[#07111d]/90 p-1 shadow-xl backdrop-blur">
              <button onClick={() => setMode("map")} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 ${mode === "map" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"}`}><MapIcon className="h-4 w-4" /> 2D Map</button>
              <button onClick={() => setMode("globe")} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 ${mode === "globe" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"}`}><Globe2 className="h-4 w-4" /> 3D Globe</button>
            </div>
          </div>

          <div className="absolute bottom-20 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 lg:left-5 lg:right-5">
            <div className="rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-2 text-[11px] text-slate-400 backdrop-blur">
              NASA GIBS · {leftLayer.dateDependent ? safeLeftDate : "static composite"} vs {rightLayer.dateDependent ? safeRightDate : "static composite"}
            </div>
            {mode === "map" && (
              <div className="flex gap-2">
                <button onClick={handleLoadBoth} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-2 text-xs font-medium text-white backdrop-blur transition hover:border-cyan-400/40">Load layers</button>
                <button onClick={handleResetView} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-2 text-xs font-medium text-slate-200 backdrop-blur transition hover:border-cyan-400/40">Reset view</button>
              </div>
            )}
          </div>

          {/* Unified Ribbon — Earth Pulse style */}
          <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center justify-center px-4 py-3">
            <div className="inline-flex items-center gap-0.5 rounded-2xl border border-white/10 bg-[#0a1628]/95 px-1.5 py-1.5 shadow-2xl shadow-cyan-500/10 backdrop-blur-2xl">
              {VIEW_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = tab.id === "split";
                return (
                  <Link
                    key={tab.id}
                    to={tab.to}
                    className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                      isActive ? "bg-cyan-500/15 text-cyan-300 shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                    }`}
                  >
                    <TabIcon className="h-4 w-4" />
                    <span>{tab.label}</span>
                    {tab.id === "split" && <span className="ml-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">{mode === "map" ? "2D" : "3D"}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}