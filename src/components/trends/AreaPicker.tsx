import { useEffect, useId, useState } from "react";
import { Circle, Flag, Hexagon, Layers, MapPin, Plus, Search, Square, X } from "lucide-react";
import StepLabel from "@/components/common/StepLabel";
import type { DrawMode } from "@/components/map/DrawTools";
import type { SavedArea } from "@/context/WorkspaceContext";
import { partKey, savedAreaPart, type AreaPart } from "@/lib/areas/parts";
import { togetherLabel } from "@/lib/areas/resolve";
import { combinedName } from "@/lib/geo/combine";
import { formatArea } from "@/lib/geo/geometry";
import { encodeGeometryForLink } from "@/lib/geo/polyline";
import { findNamedRegion, NAMED_REGIONS, type NamedRegion } from "@/lib/trends/place";
import type { QueryEdit, TrendQuery } from "@/lib/trends/query";
import { cn } from "@/lib/utils";

const TOOLS: { mode: DrawMode; label: string; icon: typeof Square; title: string }[] = [
  { mode: "rectangle", label: "Rectangle", icon: Square, title: "Draw a rectangle on the map" },
  { mode: "polygon", label: "Polygon", icon: Hexagon, title: "Draw a polygon on the map" },
  { mode: "circle", label: "Circle", icon: Circle, title: "Draw a circle on the map" },
  { mode: "country", label: "Country or sea", icon: Flag, title: "Click a country or a sea on the map" },
];

const byLabel = (a: NamedRegion, b: NamedRegion) => a.label.localeCompare(b.label);
/** Places TerraScope knows the outline of, for the "known places" list. */
const KNOWN: { group: string; regions: NamedRegion[] }[] = [
  { group: "Regions", regions: NAMED_REGIONS.filter((r) => !r.water).sort(byLabel) },
  { group: "Seas", regions: NAMED_REGIONS.filter((r) => r.water === "sea").sort(byLabel) },
  { group: "Oceans", regions: NAMED_REGIONS.filter((r) => r.water === "ocean").sort(byLabel) },
];

const tile = "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs transition pointer-coarse:min-h-11";
const off = "border-panel-line-strong text-panel-soft hover:border-panel-foreground/50 hover:text-panel-foreground";
const on = "border-panel-foreground bg-panel-foreground text-panel";

export interface PartRow {
  key: string;
  label: string;
  /** Known once the place's outline has loaded. */
  areaKm2?: number;
}

interface AreaPickerProps {
  query: TrendQuery;
  /** The place as found (e.g. after the place-name search). */
  foundName: string | null;
  savedAreas: SavedArea[];
  drawMode: DrawMode | null;
  onDraw: (mode: DrawMode | null) => void;
  onEdit: (edit: QueryEdit) => void;
  /** Why the typed place couldn't be found. */
  placeError?: string | null;
  /** The places the area is made of, the first one first. */
  parts?: PartRow[];
  /** Their size together (shared land counted once), once every one has loaded. */
  togetherKm2?: number;
  /** While on, each place picked joins the area instead of replacing it. */
  adding?: boolean;
  onAddingChange?: (adding: boolean) => void;
  onAdd?: (part: AreaPart) => void;
  onRemovePart?: (index: number) => void;
}

const WATER_WORD = { sea: "Sea", ocean: "Ocean" } as const;

function describe(query: TrendQuery, foundName: string | null, parts: PartRow[]): { title: string; detail: string } {
  if (parts.length > 1) return { title: combinedName(parts.map((part) => part.label)), detail: togetherLabel(parts.length) };
  if (query.area?.country) return { title: query.area.name ?? "Country", detail: "Country picked on the map" };
  if (query.area?.poly) return { title: query.area.name ?? "Selected area", detail: "Area outlined on the map" };
  if (query.area?.osm) return { title: query.area.name ?? "Selected place", detail: "Exact boundary from OpenStreetMap" };
  const region = query.place ? findNamedRegion(query.place) : null;
  if (region) {
    const around = query.near ? ", with its surroundings" : "";
    return { title: region.label, detail: region.water ? `${WATER_WORD[region.water]}: its water only${around}` : `Region: ${region.context}${around}` };
  }
  if (query.place) return { title: query.place, detail: foundName && foundName !== query.place ? `Found: ${foundName}` : `Place found by name${query.near ? ", with its surroundings" : ""}` };
  return { title: "The map view", detail: "Whatever the map shows when you find changes" };
}

/** Where to look: draw or highlight an area on the map, pick a country, a sea, a known region or a saved area, or type a place. */
export default function AreaPicker({
  query,
  foundName,
  savedAreas,
  drawMode,
  onDraw,
  onEdit,
  placeError = null,
  parts = [],
  togetherKm2,
  adding = false,
  onAddingChange,
  onAdd,
  onRemovePart,
}: AreaPickerProps) {
  const inputId = useId();
  const knownId = useId();
  const combined = parts.length > 1;
  const known = query.area || combined || adding ? "" : (findNamedRegion(query.place ?? "")?.label ?? "");
  const typed = query.area || combined || adding ? "" : (query.place ?? "");
  const [text, setText] = useState(typed);
  useEffect(() => setText(typed), [typed]);
  const included = new Set(parts.map((part) => part.key));
  const commit = () => {
    const next = text.trim() || null;
    if (!next) return;
    if (adding && onAdd) {
      const region = findNamedRegion(next);
      onAdd(region ? { kind: "region", label: region.label } : { kind: "place", text: next });
      setText("");
    } else if (next !== query.place) onEdit({ place: next });
  };
  const pickKnown = (label: string) => {
    if (!label) return;
    if (adding && onAdd) onAdd({ kind: "region", label });
    else onEdit({ place: label });
  };
  const chosen = describe(query, foundName, parts);
  const isMapView = !query.place && !query.area;
  const selectedPoly = combined ? null : (query.area?.poly ?? null);

  return (
    <div className="space-y-3">
      <StepLabel number={2}>Where</StepLabel>

      <div className="flex items-start gap-2" aria-live="polite">
        <div className="min-w-0 flex-1">
          <p translate="no" className="truncate font-editorial text-[1.6rem] leading-tight text-panel-foreground">
            {chosen.title}
          </p>
          <p className="text-[11px] text-panel-muted">{chosen.detail}</p>
          {placeError && (
            <p role="alert" className="mt-1 text-[11px] leading-relaxed text-tone-warn">
              {placeError}
            </p>
          )}
        </div>
        {!isMapView && (
          <button type="button" onClick={() => onEdit({ place: null })} aria-label="Clear the area and use the map view" className="rounded-md p-1 text-panel-muted hover:text-panel-foreground pointer-coarse:p-2.5">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {combined && (
        <ul aria-label="Places in this area" className="border-t border-panel-line text-[13px]">
          {parts.map((part, index) => (
            <li key={part.key} className="flex items-center gap-2 border-b border-panel-line py-1">
              <span translate="no" className="min-w-0 flex-1 truncate text-panel-foreground">
                {part.label}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-panel-muted">{part.areaKm2 !== undefined ? formatArea(part.areaKm2) : "…"}</span>
              <button
                type="button"
                onClick={() => onRemovePart?.(index)}
                aria-label={`Take ${part.label} out of the area`}
                title="Take out of the area"
                className="shrink-0 rounded-full p-1.5 text-panel-muted transition-colors hover:text-panel-foreground pointer-coarse:p-[15px]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
          {togetherKm2 !== undefined && (
            <li className="flex items-center justify-between gap-2 py-2 font-mono text-[10.5px] tabular-nums text-panel-muted">
              <span>Together, shared land counted once</span>
              <span className="text-panel-foreground">{formatArea(togetherKm2)}</span>
            </li>
          )}
        </ul>
      )}

      {!isMapView &&
        onAddingChange &&
        (adding ? (
          <div role="status" className="rounded-lg border border-panel-foreground/30 px-3 py-2.5 text-xs leading-relaxed text-panel-soft">
            <p>
              <span className="font-medium text-panel-foreground">Adding places.</span> Draw a shape, click countries and seas one after another, or choose a place below: each joins the area. Pick one again to take it out.
            </p>
            <button type="button" onClick={() => onAddingChange(false)} className="btn-line mt-2.5">
              Done adding
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => onAddingChange(true)} className="btn-line">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add another place
          </button>
        ))}

      <div>
        <p className="mb-1.5 text-[11px] text-panel-muted">{adding ? "Add an area from the map" : "Highlight an area on the map"}</p>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Draw an area, or pick a country or sea, on the map">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const active = drawMode === tool.mode;
            return (
              <button
                key={tool.mode}
                type="button"
                aria-pressed={active}
                onClick={() => onDraw(active ? null : tool.mode)}
                title={tool.title}
                className={cn(tile, "flex-col gap-1 px-1", active ? on : off)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="text-center text-[10px] leading-tight">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor={knownId} className="mb-1.5 block text-[11px] text-panel-muted">
          {adding ? "Or add a known region, sea or ocean" : "Or choose a known region, sea or ocean"}
        </label>
        <select id={knownId} value={known} onChange={(event) => pickKnown(event.target.value)} className="field">
          <option value="">Choose a place…</option>
          {KNOWN.map(({ group, regions }) => (
            <optgroup key={group} label={group}>
              {regions.map((region) => (
                <option key={region.label} value={region.label}>
                  {region.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {savedAreas.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-panel-muted">
            <Layers className="h-3 w-3" aria-hidden /> Your saved areas (also outlined on the map)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {savedAreas.slice(0, 8).map((area) => {
              const poly = encodeGeometryForLink(area.geometry);
              const part = savedAreaPart(area, { local: false });
              const active = selectedPoly === poly || (combined && included.has(partKey(part)));
              return (
                <button
                  key={area.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => (adding && onAdd ? onAdd(part) : onEdit({ area: { poly, name: area.name } }))}
                  className={active ? "chip-on" : "chip"}
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
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-panel-line-strong px-2.5 transition-colors focus-within:border-panel-foreground/70">
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
            placeholder={adding ? "Or type a place to add" : "Or type a country, region or city"}
            autoComplete="off"
            translate="no"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-panel-foreground outline-none placeholder:text-panel-muted pointer-coarse:min-h-11"
          />
        </div>
        {!adding && (
          <button type="button" aria-pressed={isMapView} onClick={() => onEdit({ place: null })} className={cn(tile, "shrink-0", isMapView ? on : off)}>
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Map view
          </button>
        )}
      </div>
    </div>
  );
}
