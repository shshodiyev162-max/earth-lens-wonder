import { MapContainer } from "react-leaflet/MapContainer";
import { TileLayer } from "react-leaflet/TileLayer";
import { useMap, useMapEvents } from "react-leaflet/hooks";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Calendar, Layers, X, ChevronDown, MapPin } from "lucide-react";
import {
  MAP_LAYERS,
  COUNTRY_BORDERS_URL,
  formatDateForGIBS, // ✅ add this
  type MapLayer,
} from "@/lib/map-layers";
import { createMapEngineConfig, getLayerById, getInitialDate } from "@/lib/mapService";
import MapLegend from "@/components/MapLegend";
import type { LatLngExpression } from "leaflet";

function ChangeView({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

function MaxZoomEnforcer({ maxZoom }: { maxZoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setMaxZoom(maxZoom);
    if (map.getZoom() > maxZoom) {
      map.setZoom(maxZoom);
    }
  }, [maxZoom, map]);
  return null;
}

function LocationInfo() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useMapEvents({
    click(e) {
      setPos({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  if (!pos) return null;

  return (
    <div className="absolute bottom-20 left-4 z-[1000] glass-strong rounded-xl px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-foreground">
        <MapPin className="w-4 h-4 text-primary" />
        <span>{pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}</span>
        <button onClick={() => setPos(null)} className="ml-2 text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

interface ExploreMapProps {
  className?: string;
  initialLayer?: string;
  showControls?: boolean;
  onLayerChange?: (layer: MapLayer) => void;
  syncCenter?: [number, number];
  syncZoom?: number;
  onMove?: (center: [number, number], zoom: number) => void;
  date?: string;
  onDateChange?: (date: string) => void;
  showCredits?: boolean;
}

export default function ExploreMap({
  className = "h-screen",
  initialLayer = "blue-marble",
  showControls = true,
  onLayerChange,
  syncCenter,
  syncZoom,
  onMove,
  date: externalDate,
  onDateChange,
  showCredits = true,
}: ExploreMapProps) {
  const initialConfig = createMapEngineConfig({
    initialLayerId: initialLayer,
    initialCenter: syncCenter,
    initialZoom: syncZoom,
    date: externalDate,
  });

  const [selectedLayer, setSelectedLayer] = useState<MapLayer>(initialConfig.layer);
  const [internalDate, setInternalDate] = useState(() => getInitialDate(initialConfig.date));
  const date = externalDate ?? internalDate;
  const setDate = (d: string) => {
    setInternalDate(d);
    onDateChange?.(d);
  };

  const [showLayers, setShowLayers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [center, setCenter] = useState<[number, number]>(initialConfig.view.center);
  const [zoom, setZoom] = useState(initialConfig.view.zoom);
  const [showSearch, setShowSearch] = useState(false);

  const handleLayerSelect = (layer: MapLayer) => {
    setSelectedLayer(layer);
    setShowLayers(false);
    onLayerChange?.(layer);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const coordMatch = searchQuery.match(/^(-?\d+\.?\d*),?\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      setCenter([parseFloat(coordMatch[1]), parseFloat(coordMatch[2])]);
      setZoom(8);
      setShowSearch(false);
      return;
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      if (data.length > 0) {
        setCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        setZoom(8);
        setShowSearch(false);
      }
    } catch (e) {
      console.error("Search failed:", e);
    }
  };

  useEffect(() => {
    if (syncCenter) setCenter(syncCenter);
  }, [syncCenter]);

  useEffect(() => {
    if (syncZoom !== undefined) setZoom(syncZoom);
  }, [syncZoom]);

  function MapEvents() {
    useMapEvents({
      moveend(e) {
        const map = e.target;
        const c = map.getCenter();
        onMove?.([c.lat, c.lng], map.getZoom());
      },
    });
    return null;
  }

  const tileUrl = createMapEngineConfig({
    initialLayerId: selectedLayer.id,
    initialCenter: center,
    initialZoom: zoom,
    date,
  }).tileUrl;

  return (
    <div className={`relative ${className}`}>
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
        maxZoom={selectedLayer.maxZoom}
      >
        <ChangeView center={center} zoom={zoom} />
        <MaxZoomEnforcer maxZoom={selectedLayer.maxZoom} />
        {onMove && <MapEvents />}
        <TileLayer url={tileUrl} maxZoom={selectedLayer.maxZoom} />
        <TileLayer url={COUNTRY_BORDERS_URL} opacity={0.7} />
        <LocationInfo />
      </MapContainer>

      {showControls && (
        <>
          {/* Top controls bar */}
          <div className="absolute top-20 left-4 right-4 z-[1000] flex items-start gap-3 pointer-events-none">
            {/* Search */}
            <div className="pointer-events-auto">
              <AnimatePresence>
                {showSearch ? (
                  <motion.div
                    initial={{ width: 44 }}
                    animate={{ width: 320 }}
                    exit={{ width: 44 }}
                    className="glass-strong rounded-xl overflow-hidden flex items-center"
                  >
                    <input
                      autoFocus
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Search place or coordinates..."
                      className="flex-1 bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    />
                    <button onClick={() => setShowSearch(false)} className="px-3 text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ) : (
                  <button
                    onClick={() => setShowSearch(true)}
                    className="glass-strong rounded-xl p-3 hover:bg-card/90 transition-colors"
                  >
                    <Search className="w-5 h-5 text-foreground" />
                  </button>
                )}
              </AnimatePresence>
            </div>

            {/* Layer picker */}
            <div className="pointer-events-auto relative">
              <button
                onClick={() => setShowLayers(!showLayers)}
                className="glass-strong rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-foreground hover:bg-card/90 transition-colors"
              >
                <Layers className="w-4 h-4 text-primary" />
                {selectedLayer.name}
                <ChevronDown className={`w-4 h-4 transition-transform ${showLayers ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {showLayers && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute top-14 left-0 w-72 glass-strong rounded-xl p-2 space-y-0.5 max-h-96 overflow-y-auto"
                  >
                    {MAP_LAYERS.map((layer) => (
                      <button
                        key={layer.id}
                        onClick={() => handleLayerSelect(layer)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          selectedLayer.id === layer.id
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-secondary"
                        }`}
                      >
                        <div className="font-medium">{layer.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {layer.description} (max zoom: {layer.maxZoom})
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Date picker */}
            {selectedLayer.dateDependent && (
              <div className="pointer-events-auto">
                <div className="glass-strong rounded-xl px-4 py-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={formatDateForGIBS(new Date())}
                    className="bg-transparent text-sm text-foreground outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          {selectedLayer.legend && (
            <MapLegend layer={selectedLayer} />
          )}
        </>
      )}

      {/* Credits */}
      {showCredits && (
        <div className="absolute bottom-2 left-2 z-[1000] text-xs text-muted-foreground/70 pointer-events-none">
          Created by <span className="font-semibold text-muted-foreground">Bukhara Nova</span> · Data: NASA GIBS
        </div>
      )}
    </div>
  );
}
