import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { MAP_LAYERS, getDefaultDate, formatDateForGIBS, getSafeDate, getTileUrl } from "@/lib/map-layers";
import { CalendarDays, ChevronDown, Columns2, Globe2, Info, Layers3, LayoutGrid, Map as MapIcon, MapPin, Search, X } from "lucide-react";
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

const earthLayers = MAP_LAYERS.filter((layer) => layer.world === "earth").map((layer) => ({
  ...layer,
  title: layer.name,
}));

export default function SyncView() {
  const leftMapRef = useRef<HTMLDivElement>(null);
  const rightMapRef = useRef<HTMLDivElement>(null);
  const leftMapInstance = useRef<L.Map | null>(null);
  const rightMapInstance = useRef<L.Map | null>(null);
  const leftLayerRef = useRef<L.TileLayer | null>(null);
  const rightLayerRef = useRef<L.TileLayer | null>(null);

  const [leftLayerId, setLeftLayerId] = useState("VIIRS_NOAA20_CorrectedReflectance_TrueColor");
  const [rightLayerId, setRightLayerId] = useState("MODIS_Terra_CorrectedReflectance_Bands721");
  const [date, setDate] = useState(getDefaultDate());
  const [leftSearch, setLeftSearch] = useState("");
  const [rightSearch, setRightSearch] = useState("");
  const [showLeftLayers, setShowLeftLayers] = useState(false);
  const [showRightLayers, setShowRightLayers] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(QUICK_REGIONS[0]);
  const [mode, setMode] = useState<WorkspaceMode>("map");
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });

  const leftLayer = earthLayers.find((l) => l.id === leftLayerId) ?? earthLayers[0];
  const rightLayer = earthLayers.find((l) => l.id === rightLayerId) ?? earthLayers[0];
  const safeLeftDate = getSafeDate(leftLayer, date);
  const safeRightDate = getSafeDate(rightLayer, date);

  const filteredLeftLayers = leftSearch
    ? earthLayers.filter((l) => l.title.toLowerCase().includes(leftSearch.toLowerCase()) || l.id.toLowerCase().includes(leftSearch.toLowerCase()))
    : earthLayers;

  const filteredRightLayers = rightSearch
    ? earthLayers.filter((l) => l.title.toLowerCase().includes(rightSearch.toLowerCase()) || l.id.toLowerCase().includes(rightSearch.toLowerCase()))
    : earthLayers;

  useEffect(() => {
    if (mode !== "map") return;
    if (!leftMapRef.current || !rightMapRef.current) return;
    if (leftMapInstance.current || rightMapInstance.current) return;

    const loadLeaflet = () => {
      if (typeof window !== "undefined" && window.L) {
        initMaps(window.L);
      } else {
        const linkEl = document.createElement("link");
        linkEl.rel = "stylesheet";
        linkEl.href = "https://unpkg.com/leaflet/dist/leaflet.css";
        document.head.appendChild(linkEl);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet/dist/leaflet.js";
        script.onload = () => initMaps(window.L);
        document.body.appendChild(script);
      }
    };

    loadLeaflet();

    return () => {
      if (leftMapInstance.current) { leftMapInstance.current.remove(); leftMapInstance.current = null; }
      if (rightMapInstance.current) { rightMapInstance.current.remove(); rightMapInstance.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Shared flag so the two maps stay perfectly locked without ping-ponging
  const syncingRef = useRef(false);

  const syncMaps = (mapA: L.Map, mapB: L.Map) => {
    const sync = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      mapB.setView(mapA.getCenter(), mapA.getZoom(), { animate: false });
      syncingRef.current = false;
    };
    mapA.on("move zoom moveend zoomend", sync);
  };

  const initMap = (el: HTMLDivElement, withAttribution: boolean) => {
    const map = L.map(el, { center: selectedRegion.center, zoom: selectedRegion.zoom, zoomControl: false, attributionControl: withAttribution });
    L.control.scale({ position: "bottomright", imperial: false, metric: true }).addTo(map);
    fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
      .then((r) => r.json())
      .then((data) => {
        L.geoJSON(data, { style: { color: "#00ffff", weight: 1, fillOpacity: 0 } }).addTo(map);
      });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap, © CARTO",
      zIndex: 1000,
    }).addTo(map);
    return map;
  };

  const initMaps = (L: typeof import("leaflet")) => {
    if (!leftMapRef.current || !rightMapRef.current) return;
    if (leftMapInstance.current || rightMapInstance.current) return;

    leftMapInstance.current = initMap(leftMapRef.current, true);
    rightMapInstance.current = initMap(rightMapRef.current, false);

    syncMaps(leftMapInstance.current, rightMapInstance.current);
    syncMaps(rightMapInstance.current, leftMapInstance.current);

    leftMapInstance.current.on("mousemove", (e) => {
      setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    loadLeftLayer();
    loadRightLayer();
  };

  const loadLeftLayer = useCallback(() => {
    if (!leftMapInstance.current || !window.L) return;
    const url = getTileUrl(leftLayer, safeLeftDate);
    if (leftLayerRef.current) leftMapInstance.current.removeLayer(leftLayerRef.current);
    leftLayerRef.current = L.tileLayer(url, { maxZoom: leftLayer.maxZoom, attribution: "NASA GIBS", crossOrigin: true }).addTo(leftMapInstance.current);
  }, [leftLayer, safeLeftDate]);

  const loadRightLayer = useCallback(() => {
    if (!rightMapInstance.current || !window.L) return;
    const url = getTileUrl(rightLayer, safeRightDate);
    if (rightLayerRef.current) rightMapInstance.current.removeLayer(rightLayerRef.current);
    rightLayerRef.current = L.tileLayer(url, { maxZoom: rightLayer.maxZoom, attribution: "NASA GIBS", crossOrigin: true }).addTo(rightMapInstance.current);
  }, [rightLayer, safeRightDate]);

  useEffect(() => { if (mode === "map") loadLeftLayer(); }, [loadLeftLayer, mode]);
  useEffect(() => { if (mode === "map") loadRightLayer(); }, [loadRightLayer, mode]);

  useEffect(() => {
    const center = selectedRegion.center as [number, number];
    const zoom = selectedRegion.zoom;
    if (leftMapInstance.current) leftMapInstance.current.setView(center, zoom);
    if (rightMapInstance.current) rightMapInstance.current.setView(center, zoom);
  }, [selectedRegion]);

  const selectLeftLayer = (next: typeof earthLayers[number]) => { setLeftLayerId(next.id); setShowLeftLayers(false); setLeftSearch(""); };
  const selectRightLayer = (next: typeof earthLayers[number]) => { setRightLayerId(next.id); setShowRightLayers(false); setRightSearch(""); };

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#02070d]">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <aside className={`${mobilePanel ? "flex" : "hidden"} absolute inset-x-0 top-16 bottom-0 z-[1200] w-full flex-col overflow-y-auto border-r border-white/10 bg-[#07111d]/98 p-5 backdrop-blur-xl lg:static lg:z-auto lg:flex lg:w-[22rem] lg:shrink-0`}>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-400">Earth observation</p>
              <h1 className="text-2xl font-bold text-white">Synced maps</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">Two verified GIBS layers in lockstep. Pan, zoom, or jump to a quick region — both views stay perfectly in sync.</p>
            </div>
            <button onClick={() => setMobilePanel(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden" aria-label="Close controls"><X className="h-5 w-5" /></button>
          </div>

          <section className="mb-5">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Layers3 className="h-4 w-4 text-cyan-400" /> Left layer</label>
            <div className="relative">
              <button onClick={() => setShowLeftLayers((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-cyan-400/40"><span><span className="block text-sm font-semibold text-white">{leftLayer.name}</span><span className="mt-0.5 block text-xs text-slate-500">{leftLayer.cadence ?? "NASA GIBS"} · max zoom {leftLayer.maxZoom}</span></span><ChevronDown className={`h-4 w-4 text-slate-400 transition ${showLeftLayers ? "rotate-180" : ""}`} /></button>
              {showLeftLayers && (
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
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Layers3 className="h-4 w-4 text-cyan-400" /> Right layer</label>
            <div className="relative">
              <button onClick={() => setShowRightLayers((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-cyan-400/40"><span><span className="block text-sm font-semibold text-white">{rightLayer.name}</span><span className="mt-0.5 block text-xs text-slate-500">{rightLayer.cadence ?? "NASA GIBS"} · max zoom {rightLayer.maxZoom}</span></span><ChevronDown className={`h-4 w-4 text-slate-400 transition ${showRightLayers ? "rotate-180" : ""}`} /></button>
              {showRightLayers && (
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
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><CalendarDays className="h-4 w-4 text-cyan-400" /> Observation date</label>
            {leftLayer.dateDependent || rightLayer.dateDependent ? (
              <input type="date" value={date} max={formatDateForGIBS(new Date())} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white [color-scheme:dark] outline-none focus:border-cyan-400/50" />
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-400">Static cloud-free composite</div>
            )}
            <p className="mt-2 text-xs text-slate-500">Recent dates are clamped to a safe availability window for this {(leftLayer.dateDependent ? leftLayer : rightLayer).cadence} product.</p>
          </section>

          <section className="mb-5">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Globe2 className="h-4 w-4 text-cyan-400" /> Quick regions</label>
            <div className="flex flex-wrap gap-2">
              {QUICK_REGIONS.map((region) => (
                <button key={region.id} onClick={() => { setSelectedRegion(region); setMobilePanel(false); }} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${selectedRegion.id === region.id ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{region.name}</button>
              ))}
            </div>
          </section>

          <section className="mt-auto rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Info className="h-4 w-4 text-cyan-400" /> {leftLayer.name} + {rightLayer.name}</div>
            <p className="text-xs leading-relaxed text-slate-400">{leftLayer.description}</p>
            <div className="mt-3 flex gap-2 text-[11px]">
              <span className="rounded bg-white/5 px-2 py-1 text-slate-300">{leftLayer.unit ?? "NASA"}</span>
              <span className="rounded bg-white/5 px-2 py-1 text-slate-300">{rightLayer.unit ?? "NASA"}</span>
            </div>
          </section>
        </aside>

        <main className="relative min-h-0 flex-1">
          {mode === "map" ? (
            <div className="absolute inset-0">
              <div ref={leftMapRef} className="absolute inset-y-0 left-0 right-1/2" />
              <div ref={rightMapRef} className="absolute inset-y-0 right-0 left-1/2 border-l border-white/15" />
              <div className="absolute top-4 left-4 z-[1000] hidden lg:block rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur">{leftLayer.name}</div>
              <div className="absolute top-4 right-4 z-[1000] hidden lg:block rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur">{rightLayer.name}</div>
              <div className="absolute bottom-4 left-4 z-[1000] rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-2 text-xs text-white backdrop-blur">
                <MapPin className="w-3 h-3 inline mr-1 text-cyan-400" /> Lat: {coords.lat.toFixed(3)}, Lng: {coords.lng.toFixed(3)}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex">
              <div className="relative flex-1">
                <LayerGlobe layer={leftLayer} date={safeLeftDate} />
                <div className="absolute top-4 left-4 z-10 hidden lg:block rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur">{leftLayer.name}</div>
              </div>
              <div className="relative flex-1 border-l border-white/15">
                <LayerGlobe layer={rightLayer} date={safeRightDate} />
                <div className="absolute top-4 right-4 z-10 hidden lg:block rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur">{rightLayer.name}</div>
              </div>
            </div>
          )}

          <div className="absolute left-3 right-3 top-3 z-[1000] flex items-center justify-center gap-3 lg:left-5 lg:right-5">
            <button onClick={() => setMobilePanel(true)} className="absolute left-0 flex items-center gap-2 rounded-xl border border-white/10 bg-[#07111d]/90 px-3 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur lg:hidden">
              <Layers3 className="h-4 w-4 text-cyan-400" /> Controls
            </button>
            <div className="flex rounded-xl border border-white/10 bg-[#07111d]/90 p-1 shadow-xl backdrop-blur">
              <button onClick={() => setMode("map")} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 ${mode === "map" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"}`}><MapIcon className="h-4 w-4" /> 2D Map</button>
              <button onClick={() => setMode("globe")} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 ${mode === "globe" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"}`}><Globe2 className="h-4 w-4" /> 3D Globe</button>
            </div>
          </div>

          <div className="absolute bottom-20 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 lg:left-5 lg:right-5">
            <div className="rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-2 text-[11px] text-slate-400 backdrop-blur">
              NASA GIBS · {leftLayer.dateDependent ? safeLeftDate : "static composite"} synced with {rightLayer.dateDependent ? safeRightDate : "static composite"}
            </div>
            {mode === "map" && (
              <button onClick={() => { loadLeftLayer(); loadRightLayer(); }} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-2 text-xs font-medium text-white backdrop-blur transition hover:border-cyan-400/40">Load layers</button>
            )}
          </div>

          {/* Unified Ribbon — Earth Pulse style */}
          <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center justify-center px-4 py-3">
            <div className="inline-flex items-center gap-0.5 rounded-2xl border border-white/10 bg-[#0a1628]/95 px-1.5 py-1.5 shadow-2xl shadow-cyan-500/10 backdrop-blur-2xl">
              {VIEW_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = tab.id === "sync";
                return (
                  <Link
                    key={tab.id}
                    to={tab.to}
                    className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${isActive ? "bg-cyan-500/15 text-cyan-300 shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"}`}
                  >
                    <TabIcon className="h-4 w-4" />
                    <span>{tab.label}</span>
                    {tab.id === "sync" && <span className="ml-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">{mode === "map" ? "2D" : "3D"}</span>}
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