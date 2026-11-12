import type { Feature } from "geojson";
import { GeoJSON, Pane, Tooltip } from "react-leaflet";
import type { PolygonGeometry } from "@/lib/geo/geometry";
import type { HotspotDetail } from "@/lib/trends/scan";

interface HotspotLayerProps {
  hotspots: HotspotDetail[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Outline of the whole scanned area. */
  area: PolygonGeometry | null;
}

/** Numbered hotspot outlines above the change map; the selected one is highlighted. */
export default function HotspotLayer({ hotspots, selectedId, onSelect, area }: HotspotLayerProps) {
  return (
    <>
      {area && (
        <Pane name="trend-area" style={{ zIndex: 425, pointerEvents: "none" }}>
          <GeoJSON
            key={JSON.stringify(area).length}
            data={{ type: "Feature", properties: {}, geometry: area } as Feature}
            interactive={false}
            style={{ color: "#ffffff", weight: 1, opacity: 0.7, dashArray: "4 5", fill: false }}
          />
        </Pane>
      )}
      <Pane name="trend-hotspots" style={{ zIndex: 450 }}>
        {hotspots.map((hotspot) => {
          const selected = hotspot.id === selectedId;
          return (
            <GeoJSON
              key={`${hotspot.id}-${selected ? "on" : "off"}-${hotspot.refined ? "r" : "c"}`}
              data={{ type: "Feature", properties: {}, geometry: hotspot.geometry } as Feature}
              style={{
                color: "#ffffff",
                weight: selected ? 2.5 : 1.1,
                opacity: selected ? 1 : 0.85,
                fillColor: "#ffffff",
                fillOpacity: selected ? 0.14 : 0.03,
              }}
              eventHandlers={{ click: () => onSelect(hotspot.id) }}
            >
              <Tooltip permanent direction="center" className="hotspot-rank" interactive={false} pane="tooltipPane" opacity={1}>
                {hotspot.rank}
              </Tooltip>
            </GeoJSON>
          );
        })}
      </Pane>
    </>
  );
}
