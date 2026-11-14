// Measures the world change atlas: six headline measures scanned over the whole map with the app's
// own scanner (the same tests as the Trends page), every month of each year so the two hemispheres'
// seasons can't cancel out. It needs a browser (NASA's maps are decoded on a canvas):
//
//   1. npm run dev, then open any page of the app, e.g. http://localhost:8080/not-a-page
//   2. Paste this whole file into the browser's console and press Enter.
//   3. It takes several minutes, then downloads atlas.json and one PNG per measure.
//   4. Put the PNGs in public/data/atlas, and paste the JSON into src/lib/atlas/atlasData.ts as ATLAS.
//
// Each PNG is the change map exactly as the Trends page draws it (colour by direction, strength by
// rate, faded where a pixel's trend isn't clear), on a regular latitude/longitude grid.

(async () => {
  const scan = await import("/src/lib/trends/scan.ts");
  const period = await import("/src/lib/query/period.ts");
  const ind = await import("/src/lib/query/indicators.ts");
  const geom = await import("/src/lib/geo/geometry.ts");
  const render = await import("/src/lib/trends/render.ts");
  const polyline = await import("/src/lib/geo/polyline.ts");
  const geocode = await import("/src/lib/geo/geocode.ts");
  const waters = await import("/src/lib/geo/waters.ts");
  const countries = await import("/src/lib/geo/countries.ts");
  const query = await import("/src/lib/trends/query.ts");
  const countryIndex = await countries.loadCountries();

  // window.__terrascopeSave, when set, takes the files instead of the browser's downloads.
  const save =
    window.__terrascopeSave ??
    ((name, blob) => {
      const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
      link.click();
      URL.revokeObjectURL(link.href);
    });
  const round = (v, d) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

  // Web maps stop short of the poles; south of 60°S is Antarctica's ice and the Southern Ocean.
  const BBOX = [-180, -60, 180, 80];
  const START = 2003;
  const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const MEASURES = ["vegetation", "heat", "airTemp", "rainfall", "snow", "sst"];
  // Every month of every year: 23 years x 12 months fits under this.
  const MAX_MAPS = 300;
  // Change that is widespread (warming, greening) joins into continent-sized patches at this scale.
  // The bar is raised step by step until the biggest patch is a region rather than half an ocean;
  // the bar used is saved and shown on the page.
  const MAX_PATCH_KM2 = 2_500_000;
  const FACTORS = [1, 1.5, 2, 3, 4, 6, 8];

  // Named by the sea it lies in, the country it sits in (the bundled outlines; "around" when the
  // patch is much bigger than the country), or for smaller patches the province or district.
  const nameOf = async (hotspot, id) => {
    const sea = waters.waterAt(hotspot.center);
    if (id === "sst" && sea) return sea.label;
    const country = countryIndex && countries.countryAt(countryIndex, hotspot.center);
    if (hotspot.areaKm2 >= 300_000 || !country) {
      if (!country) return sea?.label ?? `Near ${geom.formatLatLng(hotspot.center, 1)}`;
      return hotspot.areaKm2 > 1.5 * geom.areaKm2(country.geometry) ? `Around ${country.name}` : country.name;
    }
    const place = await geocode.reverseGeocode(hotspot.center, { zoom: hotspot.areaKm2 >= 50_000 ? 5 : 8 }).catch(() => null);
    return place ?? country.name;
  };

  const area = { name: "The world", context: "60°S to 80°N", geometry: geom.bboxPolygon(BBOX), bbox: BBOX, center: [10, 0], kind: "region" };
  const verdict = (v, d) =>
    v && {
      direction: v.direction,
      p: Number(v.p.toPrecision(3)),
      slopePerYear: round(v.slopePerYear, d),
      lowerPerYear: round(v.lowerPerYear, d),
      upperPerYear: round(v.upperPerYear, d),
      slopePerDecade: round(v.slopePerDecade, d),
      years: v.years,
      carryOver: round(v.carryOver, 2),
    };

  const measures = [];
  for (const id of MEASURES) {
    console.log(`Measuring ${id}…`);
    const info = ind.INDICATORS[id];
    const availability = await scan.fetchAvailability(id);
    const plan = period.planPeriod({ kind: "since", start: START }, ALL_MONTHS, availability.window, MAX_MAPS);
    if (plan.error) throw new Error(`${id}: ${plan.error}`);
    const result = await scan.runScan({ indicator: id, direction: "any", area, plan, availability, maxSize: 720, refine: false });

    const scale = render.changeScale(result.trends, info, true);
    const rgba = render.changeImage(result.trends, scale);
    const canvas = Object.assign(document.createElement("canvas"), { width: result.grid.width, height: result.grid.height });
    canvas.getContext("2d").putImageData(new ImageData(rgba, result.grid.width, result.grid.height), 0, 0);
    await save(`${id}.png`, await new Promise((resolve) => canvas.toBlob(resolve, "image/png")));

    // The strict test (5% false discovery rate across every pixel) where it finds patches; where it
    // finds fewer than three (snow cover is patchy and noisy), the Trends page's usual test, said so.
    const patches = (factor, strict) => scan.rebuildHotspots(result, { direction: "any", minFactor: factor, minAreaKm2: 0, strict });
    const strict = patches(FACTORS[0], true).length >= 3;
    let factor = FACTORS[0];
    let found = [];
    for (factor of FACTORS) {
      found = patches(factor, strict);
      if (Math.max(0, ...found.map((h) => h.areaKm2)) <= MAX_PATCH_KM2) break;
    }
    const top = found.slice(0, 8);
    for (const h of top) h.label = await nameOf(h, id);
    const names = Object.fromEntries(query.withDistinctLabels(top).map((h) => [h.id, h.label]));
    const d = Math.max(info.decimals + 2, 3);
    measures.push({
      id,
      file: `${id}.png`,
      startYear: plan.years[0],
      endYear: plan.years[plan.years.length - 1],
      yearsRead: plan.years.length,
      mapsRead: result.monthsRead.length,
      notes: result.notes,
      baseline: plan.baseline,
      recent: plan.recent,
      // A change counts when the last years differ from the first by at least this, and the pixel's
      // trend is clear: with every pixel tested allowed for (strict), or at p < 0.1 as on the Trends page.
      minChange: round(info.minChange * factor, d),
      strict,
      grid: { bbox: result.grid.bbox, width: result.grid.width, height: result.grid.height },
      scale: { max: scale.max, unit: scale.unit },
      region: {
        verdict: verdict(result.region.verdict, d),
        meanChange: round(result.region.meanChange, d),
        scannedKm2: Math.round(result.region.scannedKm2),
        validShare: round(result.region.validShare, 3),
      },
      hotspots: top.map((h) => ({
        rank: h.rank,
        name: names[h.id] ?? null,
        sign: h.sign,
        center: h.center.map((v) => round(v, 2)),
        bbox: h.bbox.map((v) => round(v, 2)),
        outline: polyline.encodeGeometryForLink(h.geometry),
        areaKm2: Math.round(h.areaKm2),
        meanChange: round(h.meanChange, d),
        significantShare: round(h.significantShare, 3),
        verdict: verdict(h.verdict, d),
      })),
    });
  }
  const measuredOn = new Date().toISOString().slice(0, 10);
  await save("atlas.json", new Blob([JSON.stringify({ measuredOn, bbox: BBOX, measures }, null, 2)], { type: "application/json" }));
  window.__terrascopeAtlas = { measuredOn, measures };
  console.log("Done.", measures.length);
})();
