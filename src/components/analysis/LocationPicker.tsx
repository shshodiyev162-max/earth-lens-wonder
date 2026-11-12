import { useEffect, useMemo, useState } from "react";
import { LocateFixed, Loader2, Map as MapIcon, Plus, X } from "lucide-react";
import PlaceSearch from "@/components/search/PlaceSearch";
import { useWorkspace } from "@/context/WorkspaceContext";
import { partKey, savedAreaPart } from "@/lib/areas/parts";
import type { PlaceResult } from "@/lib/geo/geocode";
import { formatArea, type LatLng } from "@/lib/geo/geometry";
import type { AnalysisTarget } from "@/lib/analysis/types";

const RADII = [2, 5, 10, 25, 50];

export interface PartRow {
  key: string;
  label: string;
  /** Known once the place's outline has loaded. */
  areaKm2?: number;
}

interface LocationPickerProps {
  target: AnalysisTarget | null;
  loading: boolean;
  /** The places the area is made of, the first one first. */
  parts: PartRow[];
  /** While on, each place picked joins the area instead of replacing it. */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  onPlace: (place: PlaceResult) => void;
  onPoint: (point: LatLng, radiusKm: number) => void;
  /** A new size for the circle around the first place. */
  onRadius: (radiusKm: number) => void;
  onArea: (id: string) => void;
  onRemovePart: (index: number) => void;
  /** Brings the page's map into view (places are clicked, drawn and picked there). */
  onShowMap: () => void;
}

/** Choosing the place without the map: search, your location, saved areas, and the places of a combined area. */
export default function LocationPicker({ target, loading, parts, adding, onAddingChange, onPlace, onPoint, onRadius, onArea, onRemovePart, onShowMap }: LocationPickerProps) {
  const { areas, view } = useWorkspace();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const radius = target?.ref.type === "point" ? target.ref.radiusKm : 10;
  const included = useMemo(() => new Set(parts.map((part) => part.key)), [parts]);

  useEffect(() => setLocateError(null), [target]);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setLocateError("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onPoint([position.coords.latitude, position.coords.longitude], radius);
      },
      () => {
        setLocating(false);
        setLocateError("Couldn't get your location — allow location access or search instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <PlaceSearch
          onSelect={onPlace}
          near={view.center}
          placeholder={adding ? "Search a place to add" : "Search a city, region or coordinates"}
          ariaLabel={adding ? "Search a place to add to the area" : "Search a place to analyze"}
          clearOnSelect
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <button type="button" onClick={locate} className="link-quiet inline-flex items-center gap-1.5 pointer-coarse:min-h-11">
            {locating ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <LocateFixed className="h-3 w-3" aria-hidden />}
            {adding ? "Add my location" : "Use my location"}
          </button>
          <button type="button" onClick={onShowMap} className="link-quiet inline-flex items-center gap-1.5 pointer-coarse:min-h-11">
            <MapIcon className="h-3 w-3" aria-hidden /> Pick on the map
          </button>
        </div>
        {locateError && <p className="mt-2 text-xs text-earth-yellow">{locateError}</p>}
        {loading && (
          <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Loading the boundary…
          </p>
        )}
      </div>

      {parts.length > 0 && (
        <div className="space-y-2.5">
          {parts.length > 1 && (
            <ul aria-label="Places in this area" className="border-t border-border text-sm">
              {parts.map((part, index) => (
                <li key={part.key} className="flex items-center gap-2 border-b border-border py-1">
                  <span translate="no" className="min-w-0 flex-1 truncate text-foreground">
                    {part.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">{part.areaKm2 !== undefined ? formatArea(part.areaKm2) : "…"}</span>
                  <button
                    type="button"
                    onClick={() => onRemovePart(index)}
                    aria-label={`Take ${part.label} out of the area`}
                    title="Take out of the area"
                    className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground pointer-coarse:p-[15px]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
              {target?.parts && (
                <li className="flex items-center justify-between gap-2 py-2 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                  <span>Together, shared land counted once</span>
                  <span className="text-foreground">{formatArea(target.areaKm2)}</span>
                </li>
              )}
            </ul>
          )}
          {adding ? (
            <div role="status" className="rounded-lg border border-foreground/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Adding places.</span> Search, click the map, draw a shape, or pick countries and seas one after another: each joins the area. Pick one again to take it out.
              </p>
              <button type="button" onClick={() => onAddingChange(false)} className="btn-line mt-2.5">
                Done adding
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => onAddingChange(true)} className="btn-line">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add another place
            </button>
          )}
        </div>
      )}

      {target?.ref.type === "point" && (
        <div>
          <div className="mb-2 text-xs text-muted-foreground">{target.parts ? "Area around the first point" : "Area around the point"}</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Radius">
            {RADII.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={radius === r} onClick={() => onRadius(r)} className={radius === r ? "chip-on" : "chip"}>
                {r} km
              </button>
            ))}
          </div>
        </div>
      )}

      {areas.length > 0 && (
        <div>
          <div className="mb-2 text-xs text-muted-foreground">{adding ? "Add one of your areas" : "Your areas from the map"}</div>
          <div className="flex flex-wrap gap-1.5">
            {areas.map((area) => {
              const active = included.has(`area:${area.id}`) || included.has(partKey(savedAreaPart(area)));
              return (
                <button key={area.id} type="button" aria-pressed={active} onClick={() => onArea(area.id)} className={active ? "chip-on" : "chip"}>
                  <span translate="no">{area.name}</span>
                  <span className="ml-1 font-mono text-[10px] opacity-75">{formatArea(area.areaKm2)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
