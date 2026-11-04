import { useEffect, useId, useState } from "react";
import { Circle, Flag, Hexagon, Layers, MapPin, Search, Square, X } from "lucide-react";
import type { DrawMode } from "@/components/map/DrawTools";
import type { SavedArea } from "@/context/WorkspaceContext";
import { formatArea } from "@/lib/geo/geometry";
import { encodeGeometryForLink } from "@/lib/geo/polyline";
import type { QueryEdit, TrendQuery } from "@/lib/trends/query";
import { cn } from "@/lib/utils";

const TOOLS: { mode: DrawMode; label: string; icon: typeof Square }[] = [
  { mode: "rectangle", label: "Rectangle", icon: Square },
  { mode: "polygon", label: "Polygon", icon: Hexagon },
  { mode: "circle", label: "Circle", icon: Circle },
  { mode: "country", label: "Country", icon: Flag },
];

const tile = "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition pointer-coarse:min-h-11";
const off = "border-panel-line bg-panel-tint text-panel-soft hover:text-panel-foreground";
const on = "border-cyan-400/60 bg-cyan-400/15 text-accent-cyan-soft";

interface AreaPickerProps {
  query: TrendQuery;
  /** The place as found (e.g. after the place-name search). */
  foundName: string | null;
  savedAreas: SavedArea[];
  drawMode: DrawMode | null;
  onDraw: (mode: DrawMode | null) => void;
  onEdit: (edit: QueryEdit) => void;
}

function describe(query: TrendQuery, foundName: string | null): { title: string; detail: string } {
  if (query.area?.country) return { title: query.area.name ?? "Country", detail: "Country picked on the map" };
  if (query.area?.poly) return { title: query.area.name ?? "Selected area", detail: "Area outlined on the map" };
  if (query.area?.osm) return { title: query.area.name ?? "Selected place", detail: "Exact boundary from OpenStreetMap" };
  if (query.place) return { title: query.place, detail: foundName && foundName !== query.place ? `Found: ${foundName}` : `Place found by name${query.near ? ", with its surroundings" : ""}` };
  return { title: "The map view", detail: "Whatever the map shows when you find changes" };
}

/** Where to look: draw or highlight an area on the map, pick a country or a saved area, or type a place. */
export default function AreaPicker({ query, foundName, savedAreas, drawMode, onDraw, onEdit }: AreaPickerProps) {
  const inputId = useId();
  const typed = query.area ? "" : (query.place ?? "");
  const [text, setText] = useState(typed);
  useEffect(() => setText(typed), [typed]);
  const commit = () => {
    const next = text.trim() || null;
    if (next && next !== query.place) onEdit({ place: next });
  };
  const chosen = describe(query, foundName);
  const isMapView = !query.place && !query.area;
  const selectedPoly = query.area?.poly ?? null;

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-panel-muted">Where</p>

      <div className="flex items-start gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/5 px-3 py-2" aria-live="polite">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-cyan" aria-hidden />
        <div className="min-w-0 flex-1">
          <p translate="no" className="truncate text-sm font-medium text-panel-foreground">
            {chosen.title}
          </p>
          <p className="text-[11px] text-panel-muted">{chosen.detail}</p>
        </div>
        {!isMapView && (
          <button type="button" onClick={() => onEdit({ place: null })} aria-label="Clear the area and use the map view" className="rounded-md p-1 text-panel-muted hover:text-panel-foreground pointer-coarse:p-2.5">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] text-panel-muted">Highlight an area on the map</p>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Draw an area or pick a country on the map">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const active = drawMode === tool.mode;
            return (
              <button
                key={tool.mode}
                type="button"
                aria-pressed={active}
                onClick={() => onDraw(active ? null : tool.mode)}
                title={tool.mode === "country" ? "Click a highlighted country on the map" : `Draw a ${tool.label.toLowerCase()} on the map`}
                className={cn(tile, "flex-col gap-1 px-1", active ? on : off)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="text-[10px]">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {savedAreas.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-panel-muted">
            <Layers className="h-3 w-3" aria-hidden /> Your saved areas (also outlined on the map)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {savedAreas.slice(0, 8).map((area) => {
              const poly = encodeGeometryForLink(area.geometry);
              const active = selectedPoly === poly;
              return (
                <button
                  key={area.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onEdit({ area: { poly, name: area.name } })}
                  className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition pointer-coarse:min-h-11", active ? on : off)}
                >
                  <span translate="no">{area.name}</span> · {formatArea(area.areaKm2)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          Type a place
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-panel-line bg-panel-tint px-2.5 focus-within:border-cyan-400/60">
          <Search className="h-3.5 w-3.5 shrink-0 text-panel-muted" aria-hidden />
          <input
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
            placeholder="Or type a country, region or city"
            autoComplete="off"
            translate="no"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-panel-foreground outline-none placeholder:text-panel-muted pointer-coarse:min-h-11"
          />
        </div>
        <button type="button" aria-pressed={isMapView} onClick={() => onEdit({ place: null })} className={cn(tile, "shrink-0", isMapView ? on : off)}>
          <MapPin className="h-3.5 w-3.5" aria-hidden /> Map view
        </button>
      </div>
    </div>
  );
}
