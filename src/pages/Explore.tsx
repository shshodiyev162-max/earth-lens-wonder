import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronDown, Columns2, Globe2, Info, Layers3, Map as MapIcon, Search, X, LayoutGrid } from "lucide-react";
import { COUNTRY_GEOJSON_URL, MAP_LAYERS, formatDateForGIBS, getDefaultDate, getSafeDate, getTileUrl, type MapLayer } from "@/lib/map-layers";
import { QUICK_REGIONS } from "@/lib/layerCatalog";
import LayerScaleOverlay from "@/components/LayerScaleOverlay";
import MapDrawingLayer from "@/components/MapDrawingLayer";
import SelectedAreasPanel from "@/components/SelectedAreasPanel";

const VIEW_TABS = [
  { id: "map", label: "Explore", icon: MapIcon },
  { id: "split", label: "Split", icon: Columns2 },
  { id: "sync", label: "Sync", icon: LayoutGrid },
];

const LABELS_URL = "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png";

// Cyan country borders shared with the 3D globe and Split/Sync maps.
function CountryBorders() {
  const [countries, setCountries] = useState<any>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(COUNTRY_GEOJSON_URL, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Borders unavailable"))))
      .then((data) => setCountries(data))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!countries) return null;
  return <GeoJSON data={countries} style={{ color: "#00ffff", weight: 1.2, fillOpacity: 0 }} />;
}

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom, { animate: true }); }, [center, zoom, map]);
  return null;
}

function EarthMap({ layer, date, center, zoom }: { layer: MapLayer; date: string; center: [number, number]; zoom: number }) {
  const safeZoom = Math.min(zoom, layer.maxZoom);
  return (
    <MapContainer center={center} zoom={safeZoom} maxZoom={layer.maxZoom} zoomControl attributionControl={false} className="h-full w-full">
      <ChangeView center={center} zoom={safeZoom} />
      <TileLayer key={`${layer.id}-${date}`} url={getTileUrl(layer, date)} maxZoom={layer.maxZoom} />
      <TileLayer url={LABELS_URL} opacity={0.9} maxZoom={20} />
      <CountryBorders />
      <MapDrawingLayer layers={[layer]} />
    </MapContainer>
  );
}

export default function Explore() {
  const earthLayers = useMemo(() => MAP_LAYERS.filter((item) => item.world === "earth"), []);
  const [layerId, setLayerId] = useState("VIIRS_NOAA20_CorrectedReflectance_TrueColor");
  const [date, setDate] = useState(getDefaultDate());
  const [search, setSearch] = useState("");
  const [showLayers, setShowLayers] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(QUICK_REGIONS[0]);
  const layer = useMemo(() => earthLayers.find((item) => item.id === layerId) ?? earthLayers[0], [earthLayers, layerId]);
  const safeDate = getSafeDate(layer, date);
  const filteredLayers = earthLayers.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (layer.dateDependent && date !== safeDate) setDate(safeDate);
  }, [layer, date, safeDate]);

  const selectLayer = (next: MapLayer) => {
    setLayerId(next.id);
    if (next.dateDependent) setDate(getSafeDate(next, date));
    setShowLayers(false);
    setSearch("");
  };

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#02070d]">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <aside className={`${mobilePanel ? "flex" : "hidden"} absolute inset-x-0 top-16 bottom-0 z-[1200] w-full flex-col overflow-y-auto border-r border-white/10 bg-[#07111d]/98 p-5 backdrop-blur-xl lg:static lg:z-auto lg:flex lg:w-[22rem] lg:shrink-0`}>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-400">Earth observation</p><h1 className="text-2xl font-bold text-white">Explore NASA imagery</h1><p className="mt-2 text-sm leading-relaxed text-slate-400">Choose a verified GIBS layer, date, and region. Blue country borders and a color scale are shown on the map.</p></div>
            <button onClick={() => setMobilePanel(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden" aria-label="Close controls"><X className="h-5 w-5" /></button>
          </div>
          <section className="mb-5">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Layers3 className="h-4 w-4 text-cyan-400" /> Layer</label>
            <div className="relative">
              <button onClick={() => setShowLayers((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-cyan-400/40"><span><span className="block text-sm font-semibold text-white">{layer.name}</span><span className="mt-0.5 block text-xs text-slate-500">{layer.cadence ?? "NASA GIBS"} · max zoom {layer.maxZoom}</span></span><ChevronDown className={`h-4 w-4 text-slate-400 transition ${showLayers ? "rotate-180" : ""}`} /></button>
              {showLayers && <div className="absolute left-0 right-0 top-full z-[1400] mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#0b1725] shadow-2xl"><div className="flex items-center border-b border-white/10 px-3"><Search className="h-4 w-4 text-slate-500" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search layers" className="w-full bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600" /></div><div className="max-h-72 overflow-y-auto p-2">{filteredLayers.map((item) => <button key={item.id} onClick={() => selectLayer(item)} className={`w-full rounded-lg px-3 py-2.5 text-left transition ${item.id === layer.id ? "bg-cyan-400/10 text-cyan-300" : "text-slate-200 hover:bg-white/5"}`}><span className="block text-sm font-medium">{item.name}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">{item.description}</span></button>)}</div></div>}
            </div>
          </section>
          <section className="mb-5"><label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><CalendarDays className="h-4 w-4 text-cyan-400" /> Observation date</label>{layer.dateDependent ? <input type="date" value={safeDate} max={formatDateForGIBS(new Date())} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white [color-scheme:dark] outline-none focus:border-cyan-400/50" /> : <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-400">Static cloud-free composite</div>}{layer.dateDependent && <p className="mt-2 text-xs text-slate-500">Recent dates are clamped to a safe availability window for this {layer.cadence} product.</p>}</section>
          <section className="mb-5"><label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Globe2 className="h-4 w-4 text-cyan-400" /> Quick regions</label><div className="flex flex-wrap gap-2">{QUICK_REGIONS.map((region) => <button key={region.id} onClick={() => { setSelectedRegion(region); setMobilePanel(false); }} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${selectedRegion.id === region.id ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{region.name}</button>)}</div></section>
          <section className="mt-auto rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Info className="h-4 w-4 text-cyan-400" /> {layer.name}</div><p className="text-xs leading-relaxed text-slate-400">{layer.description}</p><div className="mt-3 flex gap-2 text-[11px]"><span className="rounded bg-white/5 px-2 py-1 text-slate-300">{layer.unit ?? "NASA"}</span><span className="rounded bg-white/5 px-2 py-1 text-slate-300">{layer.cadence}</span></div>{layer.legend && <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2">{layer.legend.map((item) => <span key={item.label} className="flex items-center gap-1.5 text-[10px] text-slate-400"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />{item.label}</span>)}</div>}</section>
          <SelectedAreasPanel />
        </aside>
        <main className="relative min-h-0 flex-1">
          <EarthMap layer={layer} date={safeDate} center={selectedRegion.center} zoom={selectedRegion.zoom} />
          <div className="absolute left-3 right-3 top-3 z-[1000] flex items-center justify-between gap-3 lg:left-5 lg:right-5">
            <button onClick={() => setMobilePanel(true)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#07111d]/90 px-3 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur lg:hidden"><Layers3 className="h-4 w-4 text-cyan-400" /> Controls</button>
            <div className="ml-auto rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-2 text-[11px] text-slate-400 backdrop-blur">NASA GIBS · {layer.dateDependent ? safeDate : "static composite"}</div>
          </div>
          <LayerScaleOverlay layer={layer} position="bottom-24 right-4" />
          {/* Unified Ribbon — Earth Pulse style */}
          <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center justify-center px-4 py-3">
            <div className="inline-flex items-center gap-0.5 rounded-2xl border border-white/10 bg-[#0a1628]/95 px-1.5 py-1.5 shadow-2xl shadow-cyan-500/10 backdrop-blur-2xl">
              {VIEW_TABS.map((tab) => {
                const isActive = tab.id === "map";
                const href = `/${tab.id}`;
                const TabIcon = tab.icon;
                return (
                  <Link
                    key={tab.id}
                    to={href}
                    className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                      isActive ? "bg-cyan-500/15 text-cyan-300 shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                    }`}
                  >
                    <TabIcon className="h-4 w-4" />
                    <span>{tab.label}</span>
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