import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pane, Polyline, ScaleControl, useMap, useMapEvents } from "react-leaflet";
import { canvas, Control, DomUtil } from "leaflet";
import { countryAt, loadCountries, type CountryIndex } from "@/lib/geo/countries";
import { formatLatLng, type LatLng } from "@/lib/geo/geometry";
import { waterAt } from "@/lib/geo/waters";
import { countryNames, formatDegree, gridStep, gridValues, placeNames, pxPerDegree, WATER_NAMES, type PlacedName } from "@/lib/map/details";
import { cn } from "@/lib/utils";

const GRID_PANE = "reference-grid";
const NAMES_PANE = "reference-names";
/** The map's own limits: Web Mercator stops here, and longitude repeats past 180°. */
const MAX_LAT = 85;
const MAX_LON = 180;

function useCountries(): CountryIndex | null {
  const [index, setIndex] = useState<CountryIndex | null>(null);
  useEffect(() => {
    let active = true;
    loadCountries().then((loaded) => {
      if (active) setIndex(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return index;
}

/** The grid lines and step for what the map shows now. */
function useGrid() {
  const map = useMap();
  return useCallback(() => {
    const bounds = map.getBounds();
    const step = gridStep(pxPerDegree(map.getZoom()));
    return {
      lats: gridValues(Math.max(bounds.getSouth(), -MAX_LAT), Math.min(bounds.getNorth(), MAX_LAT), step),
      lons: gridValues(Math.max(bounds.getWest(), -MAX_LON), Math.min(bounds.getEast(), MAX_LON), step),
    };
  }, [map]);
}

/** Faint lines of latitude and longitude. One canvas keeps panning smooth. */
function GridLines() {
  const grid = useGrid();
  const renderer = useMemo(() => canvas({ pane: GRID_PANE, padding: 0.5 }), []);
  const [lines, setLines] = useState<LatLng[][]>([]);
  const update = useCallback(() => {
    const { lats, lons } = grid();
    setLines([...lats.map((lat): LatLng[] => [[lat, -MAX_LON], [lat, MAX_LON]]), ...lons.map((lon): LatLng[] => [[-MAX_LAT, lon], [MAX_LAT, lon]])]);
  }, [grid]);
  useEffect(update, [update]);
  useMapEvents({ moveend: update });
  if (!lines.length) return null;
  return <Polyline positions={lines} interactive={false} {...{ renderer }} pathOptions={{ color: "#ffffff", weight: 0.6, opacity: 0.18 }} />;
}

/** The degrees of those lines along the map's top and left edges, like the frame of a printed map. */
function GridTicks() {
  const map = useMap();
  const grid = useGrid();
  const [ticks, setTicks] = useState<{ key: string; text: string; style: { left: number } | { top: number } }[]>([]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const { x: width, y: height } = map.getSize();
      const center = map.getCenter();
      const { lats, lons } = grid();
      setTicks([
        ...lons
          .map((lon) => ({ lon, left: map.latLngToContainerPoint([center.lat, lon]).x }))
          .filter(({ left }) => left > 44 && left < width - 28)
          .map(({ lon, left }) => ({ key: `lon${lon}`, text: formatDegree(lon, "lon"), style: { left } })),
        ...lats
          .map((lat) => ({ lat, top: map.latLngToContainerPoint([lat, center.lng]).y }))
          .filter(({ top }) => top > 24 && top < height - 12)
          .map(({ lat, top }) => ({ key: `lat${lat}`, text: formatDegree(lat, "lat"), style: { top } })),
      ]);
    };
    // Follows the map while it moves, at most once per frame.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    map.on("move zoom resize viewreset", schedule);
    return () => {
      map.off("move zoom resize viewreset", schedule);
      cancelAnimationFrame(frame);
    };
  }, [map, grid]);

  return createPortal(
    <div aria-hidden className="map-ticks">
      {ticks.map((tick) => (
        <span key={tick.key} className={"left" in tick.style ? "map-tick map-tick-lon" : "map-tick map-tick-lat"} style={tick.style}>
          {tick.text}
        </span>
      ))}
    </div>,
    map.getContainer(),
  );
}

/** Country, sea and ocean names, chosen again whenever the map settles. Hidden while it zooms. */
function PlaceNames() {
  const map = useMap();
  const index = useCountries();
  const names = useMemo(() => [...WATER_NAMES, ...(index ? countryNames(index) : [])], [index]);
  const [placed, setPlaced] = useState<PlacedName[]>([]);
  const [moving, setMoving] = useState(false);

  const layout = useCallback(() => {
    const { x: width, y: height } = map.getSize();
    setPlaced(
      placeNames(names, { zoom: map.getZoom(), width, height, project: (at) => map.latLngToContainerPoint(at) }).map((name) => {
        // They sit in a pane that travels with the map, so a pan carries them along.
        const { x, y } = map.latLngToLayerPoint(name.at);
        return { ...name, x, y };
      }),
    );
  }, [map, names]);

  useEffect(layout, [layout]);
  useMapEvents({
    zoomstart: () => setMoving(true),
    moveend: () => {
      layout();
      setMoving(false);
    },
    resize: layout,
  });

  return (
    <div aria-hidden className={cn("map-names", moving && "map-names-moving")}>
      {placed.map((name) => (
        <span key={name.key} className={`map-name map-name-${name.kind}`} style={{ left: name.x, top: name.y }}>
          {name.text}
        </span>
      ))}
    </div>
  );
}

/** Where the cursor is, and what is there. Without a cursor (a phone, or the mouse elsewhere): the middle of the map. */
function Readout() {
  const map = useMap();
  const index = useCountries();
  const [box] = useState(() => DomUtil.create("div", "map-readout"));
  const hovering = useRef(false);
  const frame = useRef(0);
  const centre = useCallback((): LatLng => [map.getCenter().lat, map.getCenter().lng], [map]);
  const [point, setPoint] = useState<LatLng>(centre);

  useEffect(() => {
    const control = new Control({ position: "bottomleft" });
    control.onAdd = () => box;
    control.addTo(map);
    return () => {
      control.remove();
      cancelAnimationFrame(frame.current);
    };
  }, [map, box]);

  useMapEvents({
    mousemove: (event) => {
      hovering.current = true;
      const next: LatLng = [event.latlng.lat, event.latlng.lng];
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setPoint(next));
    },
    mouseout: () => {
      hovering.current = false;
      setPoint(centre());
    },
    moveend: () => {
      if (!hovering.current) setPoint(centre());
    },
  });

  const place = (index && countryAt(index, point)?.name) || waterAt(point)?.label || null;
  return createPortal(
    <>
      {formatLatLng(point, 2)}
      {place && <span className="map-readout-place"> · {place}</span>}
    </>,
    box,
  );
}

/** Everything a map shows besides imagery and borders: grid, names, scale and readout. */
export default function MapDetails() {
  return (
    <>
      <Pane name={GRID_PANE} style={{ zIndex: 415, pointerEvents: "none" }}>
        <GridLines />
      </Pane>
      <Pane name={NAMES_PANE} style={{ zIndex: 430, pointerEvents: "none" }}>
        <PlaceNames />
      </Pane>
      <GridTicks />
      <ScaleControl position="bottomleft" imperial={false} maxWidth={110} />
      <Readout />
    </>
  );
}
