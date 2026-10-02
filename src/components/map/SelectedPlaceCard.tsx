import { Link } from "react-router-dom";
import { BookmarkPlus, Loader2, TrendingUp, X } from "lucide-react";
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
    <div className={cn("pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-white/10 bg-[#07111d]/95 p-4 shadow-2xl backdrop-blur-xl", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">{kindLabel(place.kind)}</p>
          <h3 translate="no" className="truncate text-base font-semibold text-white">{place.name}</h3>
          <p className="truncate text-xs text-slate-400">{place.context || formatLatLng(place.center)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Close place">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
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
        <Link
          to={analysisHrefForPlace(place)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:opacity-90"
        >
          <TrendingUp className="h-3.5 w-3.5" /> Analyze this place
        </Link>
        {onSave && geometry && (
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <BookmarkPlus className="h-3.5 w-3.5" /> Save area
          </button>
        )}
      </div>
    </div>
  );
}
