import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import BaseMap from "@/components/map/BaseMap";
import FlyTo, { type FlyTarget } from "@/components/map/FlyTo";
import GibsTileLayer from "@/components/map/GibsTileLayer";
import MapPageShell, { SidebarSection } from "@/components/map/MapPageShell";
import ReferenceOverlays from "@/components/map/ReferenceOverlays";
import GridImageLayer from "@/components/trends/GridImageLayer";
import HotspotLayer from "@/components/trends/HotspotLayer";
import TrendLegend from "@/components/trends/TrendLegend";
import { answerInWords, formatP, signed } from "@/lib/analysis/stats";
import { atlasMeasure, atlasPixel, atlasScale, atlasTrendsHref, hotspotName, WORLD_ATLAS, type AtlasMeasure } from "@/lib/atlas/atlas";
import { formatArea } from "@/lib/geo/geometry";
import { decodeGeometry } from "@/lib/geo/polyline";
import { BASE_LAYER_ID, getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { MEASURE_DEFINITIONS } from "@/lib/glossary";
import { INDICATORS } from "@/lib/query/indicators";
import type { HotspotDetail } from "@/lib/trends/scan";
import { cn } from "@/lib/utils";

const base = getLayer(BASE_LAYER_ID) as GibsLayer;
const WORLD_VIEW = { center: [22, 10] as [number, number], zoom: 2 };

/** The measure's change map, decoded to pixels for the map layer. */
function useChangeMap(measure: AtlasMeasure): Uint8ClampedArray | null {
  const [state, setState] = useState<{ file: string; rgba: Uint8ClampedArray } | null>(null);
  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context || !active) return;
      context.drawImage(image, 0, 0);
      setState({ file: measure.file, rgba: context.getImageData(0, 0, canvas.width, canvas.height).data });
    };
    image.src = `${import.meta.env.BASE_URL}data/atlas/${measure.file}`;
    return () => {
      active = false;
    };
  }, [measure.file]);
  return state?.file === measure.file ? state.rgba : null;
}

/** An outline's id on the map: "heat:3". */
const outlineId = (measure: AtlasMeasure, rank: number) => `${measure.id}:${rank}`;

const perDecade = (value: number | null, unit: string, decimals: number) => (value === null ? "" : `${signed(value, decimals)} ${unit} per decade`);

/** Where Earth is changing most: six measures, already scanned over the whole map. */
export default function Atlas() {
  const [params, setParams] = useSearchParams();
  const measure = atlasMeasure(params.get("m"));
  const info = INDICATORS[measure.id];
  const [selected, setSelected] = useState<number | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const rgba = useChangeMap(measure);
  const scale = useMemo(() => atlasScale(measure), [measure]);
  const decimals = Math.max(info.decimals, 2);
  const pixel = atlasPixel(measure);

  useEffect(() => setSelected(null), [measure.id]);

  // HotspotLayer draws the Trends page's hotspots; the atlas's carry what it needs. The map keeps an
  // outline while its id stays the same, so the id names the measure as well as the rank: with the
  // rank alone, switching measure would leave the last measure's outlines on the map.
  const outlines = useMemo(
    () =>
      measure.hotspots.flatMap((hotspot) => {
        const geometry = decodeGeometry(hotspot.outline);
        return geometry ? [{ id: outlineId(measure, hotspot.rank), rank: hotspot.rank, geometry, refined: false } as HotspotDetail] : [];
      }),
    [measure],
  );

  const choose = (rank: number) => {
    setSelected(rank);
    const hotspot = measure.hotspots.find((h) => h.rank === rank);
    if (hotspot) setFlyTarget({ bbox: hotspot.bbox, key: `${measure.id}-${rank}-${Date.now()}` });
  };

  const region = measure.region.verdict;

  const sidebar = (
    <>
      <SidebarSection title="Measure">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Measure">
          {WORLD_ATLAS.measures.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === measure.id}
              onClick={() => setParams({ m: m.id }, { replace: true })}
              className={m.id === measure.id ? "chip-on" : "chip"}
            >
              {INDICATORS[m.id].label}
            </button>
          ))}
        </div>
      </SidebarSection>

      <section aria-labelledby="atlas-measure" className="mb-6 border-t border-panel-line pt-4">
        <h2 id="atlas-measure" className="font-editorial text-[1.6rem] leading-tight text-panel-foreground">
          {info.label}, {measure.startYear}–{measure.endYear}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-panel-muted">{MEASURE_DEFINITIONS[measure.id]}</p>
        {region && (
          <p className="mt-3 text-[13px] leading-relaxed text-panel-soft">
            <span className="font-medium text-panel-foreground">The whole map: {answerInWords(region)}</span> {perDecade(region.slopePerDecade, info.unit, decimals)}, 95% range{" "}
            {signed(region.lowerPerYear * 10, decimals)} to {signed(region.upperPerYear * 10, decimals)}, {formatP(region.p)}.
          </p>
        )}
      </section>

      <SidebarSection title="Where it changed most">
        <p className="mb-3 text-[12px] leading-relaxed text-panel-muted">
          Places where {measure.recent[0]}–{measure.recent[1]} differs from {measure.baseline[0]}–{measure.baseline[1]} by at least {measure.minChange.toFixed(decimals)}{" "}
          {info.unit}, with a clear trend in between. Ranked by size of area and of change.
        </p>
        {measure.hotspots.length === 0 && <p className="border-t border-panel-line pt-3 text-[13px] text-panel-soft">No patch passed the test for this measure.</p>}
        <ol className="border-t border-panel-line" aria-label="Biggest changes, largest first">
          {measure.hotspots.map((hotspot) => {
            const open = hotspot.rank === selected;
            const v = hotspot.verdict;
            return (
              <li key={hotspot.rank} className="border-b border-panel-line">
                <button
                  type="button"
                  aria-pressed={open}
                  onClick={() => choose(hotspot.rank)}
                  className={cn("grid w-full grid-cols-[1.4rem_minmax(0,1fr)] items-start gap-2 py-2.5 text-left transition-colors hover:bg-panel-tint", open && "bg-panel-tint-strong")}
                >
                  <span className="pt-0.5 font-mono text-[11px] tabular-nums text-panel-muted">{String(hotspot.rank).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span translate="no" className="block truncate text-[13px] text-panel-foreground">
                      {hotspotName(hotspot)}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10.5px] leading-snug tabular-nums text-panel-muted">
                      {hotspot.sign < 0 ? "Falling" : "Rising"} · {formatArea(hotspot.areaKm2)}
                      {v ? ` · ${perDecade(v.slopePerDecade, info.unit, decimals)} · ${formatP(v.p)}` : ""}
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="pb-3 pl-[1.9rem]">
                    <Link to={atlasTrendsHref(measure, hotspot)} className="btn-line">
                      Look closer on the Trends page <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </SidebarSection>

      <div className="space-y-2 text-[11px] leading-relaxed text-panel-muted">
        <p>
          Measured on {WORLD_ATLAS.measuredOn} with the same tests as the Trends page: {measure.mapsRead} monthly NASA maps, every month of each year from 60°S to 80°N, on
          a grid of {pixel.degrees}° (about {pixel.km} km). Each pixel gets a Mann–Kendall test and Sen&apos;s slope, allowing for years that follow the year before. Colour
          is faded where a pixel&apos;s trend isn&apos;t clear.{" "}
          {measure.strict
            ? "A patch counts only where its pixels' trends stay clear once thousands of pixels tested at once are allowed for (a 5% false discovery rate)."
            : "Hardly any pixel passes the strict test that allows for thousands of pixels tested at once, so the patches here use the Trends page's usual test (each pixel at p < 0.1, in a connected patch). Each patch's own trend is tested and shown."}
        </p>
        {measure.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </>
  );

  return (
    <MapPageShell
      eyebrow="Atlas"
      title="Where Earth is changing most."
      description="Six NASA records, already tested pixel by pixel over the whole map. Pick a change to look at it closer."
      sidebar={sidebar}
      topRight={
        <div className="float-surface hidden max-w-[30rem] truncate rounded-full px-3 py-1.5 font-mono text-[10.5px] tabular-nums text-panel-soft sm:block">
          {info.product.split(" (")[0].split(",")[0]} · {measure.startYear}–{measure.endYear} · every month
        </div>
      }
      overlay={
        <div className="absolute bottom-20 right-4 hidden sm:block">
          <TrendLegend scale={scale} title={`${info.label}: trend`} />
        </div>
      }
      panelOpen={panelOpen}
      onPanelOpenChange={setPanelOpen}
    >
      <BaseMap initialView={WORLD_VIEW}>
        <GibsTileLayer layer={base} date={null} />
        {rgba && <GridImageLayer grid={measure.grid} rgba={rgba} />}
        <ReferenceOverlays />
        <HotspotLayer
          hotspots={outlines}
          selectedId={selected === null ? null : outlineId(measure, selected)}
          onSelect={(id) => choose(Number(id.split(":")[1]))}
          area={null}
        />
        <FlyTo target={flyTarget} maxZoom={6} />
      </BaseMap>
    </MapPageShell>
  );
}
