import { describe, expect, it } from "vitest";
import { applyTransform, decodePixel, parseColorMapXml, parseInterval } from "../colormap";

// Mirrors the structure of real GIBS v1.3 colormaps (e.g. MODIS_Land_Surface_Temp.xml):
// a "No Data" map, a data map with an over-wide first/last bin, and classification entries.
const LST_LIKE = `<?xml version="1.0" encoding="UTF-8"?>
<ColorMaps>
  <ColorMap title="No Data">
    <Entries><ColorMapEntry rgb="64,64,64" transparent="true" nodata="true" sourceValue="[0,1)" ref="0"/></Entries>
    <Legend type="classification"/>
  </ColorMap>
  <ColorMap title="Land Surface Temperature" units="K">
    <Entries>
      <ColorMapEntry rgb="201,0,255" transparent="false" sourceValue="[1,10000)" value="[0.02,200.00)" ref="1"/>
      <ColorMapEntry rgb="197,0,255" transparent="false" sourceValue="[10000,10030)" value="[200.00,200.60)" ref="2"/>
      <ColorMapEntry rgb="0,255,0" transparent="false" sourceValue="[14500,14530)" value="[290.00,290.60)" ref="3"/>
      <ColorMapEntry rgb="255,4,0" transparent="false" sourceValue="[17470,17500)" value="[349.40,350.00)" ref="4"/>
      <ColorMapEntry rgb="255,1,0" transparent="false" sourceValue="[17500,32600)" value="[350.02,652.00)" ref="5"/>
    </Entries>
    <Legend type="continuous" minLabel="&lt; 200.0" maxLabel="≥ 350.0"/>
  </ColorMap>
</ColorMaps>`;

const SNOW_LIKE = `<ColorMaps>
  <ColorMap title="Normalized Difference Snow Index">
    <Entries>
      <ColorMapEntry rgb="0,255,0" transparent="true" sourceValue="[0]" value="[0]"/>
      <ColorMapEntry rgb="240,240,128" transparent="false" sourceValue="[1]" value="[1]"/>
      <ColorMapEntry rgb="255,0,0" transparent="false" sourceValue="[100]" value="[100]"/>
    </Entries>
  </ColorMap>
  <ColorMap title="Classifications">
    <Entries>
      <ColorMapEntry rgb="200,200,200" transparent="true" sourceValue="[201]"/>
      <ColorMapEntry rgb="255,255,255" transparent="true" nodata="true" sourceValue="[255]"/>
    </Entries>
  </ColorMap>
</ColorMaps>`;

const OPEN_ENDED = `<ColorMaps><ColorMap title="Chlorophyll" units="mg/m³"><Entries>
  <ColorMapEntry rgb="147,0,108" transparent="false" value="(-INF,0.0100)"/>
  <ColorMapEntry rgb="144,0,111" transparent="false" value="[0.0100,0.0103)"/>
  <ColorMapEntry rgb="110,0,0" transparent="false" value="[19.408,20.000)"/>
  <ColorMapEntry rgb="105,0,0" transparent="false" value="[20.000,+INF)"/>
</Entries></ColorMap></ColorMaps>`;

describe("parseInterval", () => {
  it("parses ranges, single values and infinities", () => {
    expect(parseInterval("[0.1,0.2)")).toEqual({ min: 0.1, max: 0.2 });
    expect(parseInterval("[99]")).toEqual({ min: 99, max: 99 });
    expect(parseInterval("(-INF,0.01)")).toEqual({ min: null, max: 0.01 });
    expect(parseInterval("[350,+INF)")).toEqual({ min: 350, max: null });
    expect(parseInterval(null)).toBeNull();
  });
});

describe("parseColorMapXml / decodePixel", () => {
  const lst = parseColorMapXml(LST_LIKE, "lst");

  it("reads title and units of the data map", () => {
    expect(lst.title).toBe("Land Surface Temperature");
    expect(lst.units).toBe("K");
  });

  it("decodes exact palette colours to bin midpoints", () => {
    expect(decodePixel(lst, 0, 255, 0, 255)).toBeCloseTo(290.3, 5);
    expect(decodePixel(lst, 197, 0, 255, 255)).toBeCloseTo(200.3, 5);
  });

  it("collapses over-wide end bins to their inner bound", () => {
    expect(decodePixel(lst, 201, 0, 255, 255)).toBe(200);
    expect(decodePixel(lst, 255, 1, 0, 255)).toBeCloseTo(350.02, 5);
    expect(lst.legend?.openMin).toBe(true);
    expect(lst.legend?.openMax).toBe(true);
  });

  it("treats transparent and no-data pixels as missing", () => {
    expect(decodePixel(lst, 64, 64, 64, 255)).toBeNull();
    expect(decodePixel(lst, 0, 255, 0, 0)).toBeNull();
  });

  it("snaps near-miss colours and rejects unrelated ones", () => {
    expect(decodePixel(lst, 1, 254, 2, 255)).toBeCloseTo(290.3, 5);
    expect(decodePixel(lst, 20, 20, 200, 255)).toBeNull();
  });

  it("handles single-value and classification maps", () => {
    const snow = parseColorMapXml(SNOW_LIKE);
    expect(decodePixel(snow, 240, 240, 128, 255)).toBe(1);
    expect(decodePixel(snow, 255, 0, 0, 255)).toBe(100);
    expect(decodePixel(snow, 200, 200, 200, 255)).toBeNull();
    expect(snow.legend?.min).toBe(1);
    expect(snow.legend?.max).toBe(100);
  });

  it("uses the finite bound of open-ended bins", () => {
    const chl = parseColorMapXml(OPEN_ENDED);
    expect(decodePixel(chl, 147, 0, 108, 255)).toBe(0.01);
    expect(decodePixel(chl, 105, 0, 0, 255)).toBe(20);
    expect(chl.legend?.openMin).toBe(true);
    expect(chl.legend?.openMax).toBe(true);
  });

  it("converts Kelvin to Celsius", () => {
    expect(applyTransform(300, "kelvinToCelsius")).toBeCloseTo(26.85, 5);
    expect(applyTransform(0.5, undefined)).toBe(0.5);
  });
});
