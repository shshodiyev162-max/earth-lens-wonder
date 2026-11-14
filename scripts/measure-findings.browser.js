// How the home page's findings are measured. It runs the app's own scanner, so the numbers are
// exactly what the Trends page gives. It needs a browser (NASA's maps are decoded on a canvas):
//
//   1. npm run dev, then open any page of the app, e.g. http://localhost:8080/not-a-page
//   2. Paste this whole file into the browser's console and press Enter.
//   3. It takes a few minutes, then downloads findings.json and one PNG per finding.
//   4. Put the PNGs in public/data/findings, and paste the JSON into
//      src/components/landing/findingsData.ts as { measuredOn, findings }.
//   5. npm test: the tests fail if the new numbers contradict the page's words ("Yes. Clearly." etc.).
//
// Each PNG holds one pixel per grid cell: red = rate per decade (0–255 maps to −scale…+scale),
// green = significant at p < 0.05, blue = measured. The scan's whole-area numbers use the same grid
// as the Trends page. Antarctica's map is drawn from a finer grid, because its default one is
// too coarse to show near the pole. Uzbekistan's numbers stay on the Trends page's grid, but its
// picture ("picture" in the JSON, <id>-fine.png) is the same test on a grid 4× finer (about 2.5 km),
// drawn on the same colour scale, because the page looks at the Aral Sea shore from close up.

(async () => {
  const scan = await import("/src/lib/trends/scan.ts");
  const place = await import("/src/lib/trends/place.ts");
  const period = await import("/src/lib/query/period.ts");
  const ind = await import("/src/lib/query/indicators.ts");
  const countries = await import("/src/lib/geo/countries.ts");
  const geom = await import("/src/lib/geo/geometry.ts");
  const geocode = await import("/src/lib/geo/geocode.ts");

  const save = (name, blob) => {
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const round = (v, d) => (v === null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
  const verdict = (v, d) =>
    v && {
      label: v.label,
      direction: v.direction,
      p: Number(v.p.toPrecision(3)),
      slopePerYear: round(v.slopePerYear, d),
      lowerPerYear: round(v.lowerPerYear, d),
      upperPerYear: round(v.upperPerYear, d),
      slopePerDecade: v.slopePerDecade === null ? null : round(v.slopePerDecade, d),
      years: v.years,
      method: v.method,
    };

  /** The rate per decade the colours top out at: the 97th percentile, so a few extremes don't wash the map out. */
  function colourScale(result) {
    const { slope } = result.trends;
    const sizes = [];
    for (let i = 0; i < slope.length; i++) if (result.mask[i] && Number.isFinite(slope[i])) sizes.push(Math.abs(slope[i] * 10));
    sizes.sort((a, b) => a - b);
    return sizes[Math.floor(sizes.length * 0.97)] || 1;
  }

  async function drawMap(result, name, scale = colourScale(result)) {
    const { width, height, bbox } = result.grid;
    const { slope, p } = result.trends;
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    const image = context.createImageData(width, height);
    let measured = 0;
    let rising = 0;
    let up = 0;
    let down = 0;
    for (let i = 0; i < slope.length; i++) {
      const valid = result.mask[i] && Number.isFinite(slope[i]);
      const rate = valid ? Math.max(-1, Math.min(1, (slope[i] * 10) / scale)) : 0;
      const significant = valid && Number.isFinite(p[i]) && p[i] < 0.05;
      if (valid) {
        measured += 1;
        if (slope[i] > 0) rising += 1;
        if (significant) slope[i] > 0 ? (up += 1) : (down += 1);
      }
      image.data.set([Math.round(127.5 + 127.5 * rate), significant ? 255 : 0, valid ? 255 : 0, 255], i * 4);
    }
    context.putImageData(image, 0, 0);
    save(name, await new Promise((resolve) => canvas.toBlob(resolve, "image/png")));
    return {
      file: name,
      bbox: bbox.map((v) => round(v, 4)),
      width,
      height,
      scalePerDecade: round(scale, 4),
      measuredPixels: measured,
      significantShare: round((up + down) / measured, 3),
      rising: round(rising / measured, 4),
      significantRising: round(up / measured, 4),
      significantFalling: round(down / measured, 4),
    };
  }

  const SCANS = [
    { id: "mediterranean", indicator: "sst", place: "Mediterranean Sea", since: 2003, direction: "increase", link: "/trends?ind=sst&dir=increase&place=Mediterranean+Sea&t=since-2003" },
    { id: "uzbekistan", indicator: "vegetation", country: "UZB", since: 2000, direction: "decline", link: "/trends?ind=vegetation&dir=decline&country=UZB&name=Uzbekistan&t=since-2000", pictureSize: 700 },
    { id: "antarctica", indicator: "ozone", place: "Antarctica", since: 2005, direction: "increase", link: "/trends?ind=ozone&dir=increase&place=Antarctica&t=since-2005", mapSize: 720 },
  ];

  const findings = {};
  for (const s of SCANS) {
    console.log(`Measuring ${s.id}…`);
    const info = ind.INDICATORS[s.indicator];
    let area;
    if (s.country) {
      const c = countries.findCountry(await countries.loadCountries(), s.country);
      area = { name: c.name, context: "Country", geometry: c.geometry, bbox: c.bbox, center: geom.centroidOf(c.geometry), kind: "country", countryId: c.id };
    } else area = await place.resolveArea(s.place, {});
    const availability = await scan.fetchAvailability(s.indicator);
    const months = ind.seasonMonths(info.season, area.center[0]);
    const plan = period.planPeriod({ kind: "since", start: s.since }, months, availability.window, 180);
    if (plan.error) throw new Error(plan.error);
    const request = { indicator: s.indicator, direction: s.direction, area, plan, availability };
    const result = await scan.runScan(request);
    const overlay = await drawMap(s.mapSize ? await scan.runScan({ ...request, maxSize: s.mapSize }) : result, `${s.id}.png`);
    if (s.pictureSize) {
      const fine = await drawMap(await scan.runScan({ ...request, maxSize: s.pictureSize }), `${s.id}-fine.png`, overlay.scalePerDecade);
      overlay.picture = { file: fine.file, bbox: fine.bbox, width: fine.width, height: fine.height };
    }

    const d = Math.max(info.decimals + 2, 3);
    const top = result.hotspots[0];
    let hotspot = null;
    if (top) {
      const zoom = top.areaKm2 >= 50000 ? 5 : top.areaKm2 >= 5000 ? 8 : 10;
      hotspot = {
        name: await geocode.reverseGeocode(top.center, { zoom }).catch(() => null),
        center: top.center.map((v) => round(v, 3)),
        bbox: top.bbox.map((v) => round(v, 3)),
        areaKm2: Math.round(top.areaKm2),
        meanChange: round(top.meanChange, d),
        series: top.series.map((y) => ({ year: y.year, value: round(y.value, d) })),
        verdict: verdict(top.verdict, d),
      };
    }
    findings[s.id] = {
      id: s.id,
      indicator: s.indicator,
      label: info.label,
      subject: info.subject,
      unit: info.unit,
      product: info.product,
      area: area.name,
      center: area.center.map((v) => round(v, 3)),
      link: s.link,
      startYear: plan.years[0],
      endYear: plan.years[plan.years.length - 1],
      yearsCount: plan.years.length,
      months: ind.monthsLabel(months),
      mapsRead: result.monthsRead.length,
      missingMonths: result.missingMonths.length,
      failedMonths: result.failedMonths.length,
      notes: result.notes,
      scannedKm2: Math.round(result.region.scannedKm2),
      validShare: round(result.region.validShare, 3),
      meanChange: round(result.region.meanChange, d),
      baseline: plan.baseline,
      recent: plan.recent,
      series: result.region.series.map((y) => ({ year: y.year, value: round(y.value, d) })),
      verdict: verdict(result.region.verdict, d),
      hotspot,
      hotspotCount: result.hotspots.length,
      overlay,
    };
  }
  const measuredOn = new Date().toISOString().slice(0, 10);
  save("findings.json", new Blob([JSON.stringify({ measuredOn, findings }, null, 2)], { type: "application/json" }));
  console.log("Done.", findings);
})();
