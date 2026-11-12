import { Link } from "react-router-dom";
import { ArrowRight, Loader2, X } from "lucide-react";
import type { PlaceSelection } from "@/hooks/usePlaceSelection";
import { kindLabel } from "@/lib/geo/geocode";
import { areaKm2, formatArea, formatLatLng } from "@/lib/geo/geometry";
import { analysisHrefForPlace } from "@/lib/links";
import { cn } from "@/lib/utils";

/** Card for the place chosen in search: analyze it or keep it as an area. */
export default function SelectedPlaceCard({
  selection,
  onClose,
  onSave,
  className,
}: {
  selection: PlaceSelection;
  onClose: () => void;
  onSave?: () => void;
  className?: string;
}) {
  const { place, geometry, loadingBoundary } = selection;
  return (
    <div className={cn("float-surface pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] bg-panel/90 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-panel-muted">{kindLabel(place.kind)}</p>
          <h3 translate="no" className="mt-1.5 truncate font-editorial text-[1.75rem] leading-[1.1] text-panel-foreground">{place.name}</h3>
          <p className="mt-0.5 truncate text-xs text-panel-muted">{place.context || formatLatLng(place.center)}</p>
        </div>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-full p-1.5 text-panel-muted transition-colors hover:text-panel-foreground pointer-coarse:p-2.5" aria-label="Close place">
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      <p className="mt-2 font-mono text-[10.5px] tabular-nums text-panel-muted">
        {loadingBoundary ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading boundary…
          </span>
        ) : geometry ? (
          <>Boundary · {formatArea(areaKm2(geometry))}</>
        ) : (
          <>{formatLatLng(place.center)}</>
        )}
      </p>
      <div className="mt-3 flex gap-2">
        <Link to={analysisHrefForPlace(place)} className="btn-solid group flex-1 px-4 py-2 text-[13px]">
          Analyze this place
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </Link>
        {onSave && geometry && (
          <button type="button" onClick={onSave} className="btn-line">
            Save area
          </button>
        )}
      </div>
    </div>
  );
}
