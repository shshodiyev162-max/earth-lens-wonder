// Traces the lakes' outlines for public/data/lakes.json: the largest area NASA's monthly maps showed
// each lake under water since 2000, with a 2 km margin. It needs a browser (NASA's maps are decoded
// on a canvas):
//
//   1. npm run dev, then open any page of the app, e.g. http://localhost:8080/not-a-page
//   2. Paste this whole file into the browser's console and press Enter.
//   3. It takes a few minutes, then downloads lakes.json. Put it in public/data.
//
// Water is read the way the Open water measure reads it (lib/trends/water): see-through on the
// monthly vegetation map. A pixel counts for a year when it was water in both months read (so a
// cloudy month alone can't add it), and for the outline when it counted in any year read. The
// months are July and August, which are clear over every lake here but three: Lake Chad is read
// after its rainy season, and the Altiplano lakes when its rains have filled them.
// The lake is the largest patch of such water in its box (patches within about 1 km joined), with
// any other patch at least 15% of its size or holding one of its marked points (the North Aral Sea,
// cut off from the south since 1987), holes filled, then widened by 2 km.
//
// To trace only some lakes again, set window.__lakesOnly = ["Aral Sea"] first: the others are kept
// as they are in public/data/lakes.json.

(async () => {
  const lakes = await import("/src/lib/geo/lakes.ts");
  const grids = await import("/src/lib/trends/grid.ts");
  const water = await import("/src/lib/trends/water.ts");
  const hotspots = await import("/src/lib/trends/hotspots.ts");
  const catalog = await import("/src/lib/gibs/catalog.ts");

  const save =
    window.__terrascopeSave ??
    ((name, blob) => {
      const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
      link.click();
      URL.revokeObjectURL(link.href);
    });
  const round = (v) => Number(v.toFixed(3));

  const YEARS = [2001, 2005, 2009, 2013, 2017, 2021, 2025];
  const MONTHS = { "Lake Chad": ["11", "12"], "Lake Titicaca": ["04", "05"], "Lake Poopó": ["04", "05"] };
  /** Points on a lake's water that must be kept, where a part of it is apart from the rest. */
  const MARKED = { "Aral Sea": [[46.55, 60.7]] };
  const only = window.__lakesOnly ?? null;
  const before = only ? await fetch("/data/lakes.json").then((response) => response.json()) : null;
  const ndvi = catalog.getLayer(water.WATER_LAYER_ID);

  function components(flags, width, height) {
    const seen = new Uint8Array(flags.length);
    const out = [];
    for (let start = 0; start < flags.length; start++) {
      if (!flags[start] || seen[start]) continue;
      const stack = [start];
      const pixels = [];
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop();
        pixels.push(i);
        const r = Math.floor(i / width);
        const c = i % width;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= height || cc >= width) continue;
            const j = rr * width + cc;
            if (flags[j] && !seen[j]) {
              seen[j] = 1;
              stack.push(j);
            }
          }
      }
      out.push(pixels);
    }
    return out.sort((a, b) => b.length - a.length);
  }

  /** Holes (land or islands closed in by the lake) filled: whatever the outside can't reach. */
  function fillHoles(flags, width, height) {
    const outside = new Uint8Array(flags.length);
    const stack = [];
    for (let c = 0; c < width; c++) stack.push(c, (height - 1) * width + c);
    for (let r = 0; r < height; r++) stack.push(r * width, r * width + width - 1);
    while (stack.length) {
      const i = stack.pop();
      if (outside[i] || flags[i]) continue;
      outside[i] = 1;
      const r = Math.floor(i / width);
      const c = i % width;
      if (r > 0) stack.push(i - width);
      if (r < height - 1) stack.push(i + width);
      if (c > 0) stack.push(i - 1);
      if (c < width - 1) stack.push(i + 1);
    }
    return outside.map((o) => (o ? 0 : 1));
  }

  function widen(flags, width, height, steps) {
    let current = flags;
    for (let k = 0; k < steps; k++) {
      const next = current.slice();
      for (let i = 0; i < current.length; i++) {
        if (!current[i]) continue;
        const r = Math.floor(i / width);
        const c = i % width;
        if (r > 0) next[i - width] = 1;
        if (r < height - 1) next[i + width] = 1;
        if (c > 0) next[i - 1] = 1;
        if (c < width - 1) next[i + 1] = 1;
      }
      current = next;
    }
    return current;
  }

  const features = [];
  const report = [];
  for (const lake of lakes.LAKES) {
    if (only && !only.includes(lake.label)) {
      const kept = before.features.find((feature) => feature.properties.label === lake.label);
      if (kept) features.push(kept);
      continue;
    }
    const grid = grids.scanGrid(lake.bbox, 400, 0.005);
    const size = grid.width * grid.height;
    const months = MONTHS[lake.label] ?? ["07", "08"];
    const ever = new Uint8Array(size);
    for (const year of YEARS) {
      const read = await Promise.all(months.map((m) => grids.fetchMonthGrid(ndvi, grid, `${year}-${m}`).catch(() => null)));
      const maps = read.filter(Boolean);
      if (!maps.length) continue;
      for (let i = 0; i < size; i++) if (maps.every((map) => !Number.isFinite(map[i]))) ever[i] = 1;
    }
    const parts = components(widen(ever, grid.width, grid.height, 1), grid.width, grid.height);
    if (!parts.length) {
      report.push(`${lake.label}: no water found`);
      continue;
    }
    const keep = new Uint8Array(size);
    const largest = parts[0].length;
    const marked = (MARKED[lake.label] ?? []).map(([lat, lon]) => {
      const { dx: px, dy: py } = hotspots.pixelSize(grid);
      return Math.floor((grid.bbox[3] - lat) / py) * grid.width + Math.floor((lon - grid.bbox[0]) / px);
    });
    const kept = parts.filter((part) => part.length >= largest * 0.15 || marked.some((index) => part.includes(index)));
    for (const part of kept) for (const i of part) keep[i] = 1;
    const { dx } = hotspots.pixelSize(grid);
    const pixelKm = dx * 111.32 * Math.cos(((lake.bbox[1] + lake.bbox[3]) / 2) * (Math.PI / 180));
    const lakeFlags = widen(fillHoles(keep, grid.width, grid.height), grid.width, grid.height, Math.max(0, Math.round(2 / pixelKm) - 1));
    const pixels = [];
    for (let i = 0; i < size; i++) if (lakeFlags[i]) pixels.push(i);
    const outline = hotspots.traceOutline(pixels, grid, dx * 1.2);
    // Outer edges only (holes were filled; the tracer can leave slivers at pinch points), and no
    // crumbs: a part under 2% of the biggest is left out.
    const ringSize = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => (i ? sum + ring[i - 1][0] * y - x * ring[i - 1][1] : sum), 0)) / 2;
    const outers = (outline.type === "Polygon" ? [outline.coordinates] : outline.coordinates).map((poly) => poly[0]);
    const biggest = Math.max(...outers.map(ringSize));
    const rings = outers.filter((ring) => ringSize(ring) >= biggest * 0.02).map((ring) => ring.map(([x, y]) => [round(x), round(y)]));
    const rounded = rings.length === 1 ? { type: "Polygon", coordinates: rings } : { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) };
    let km2 = 0;
    for (const i of pixels) km2 += hotspots.pixelAreaKm2(grid, Math.floor(i / grid.width));
    features.push({ type: "Feature", properties: { label: lake.label }, geometry: rounded });
    const points = JSON.stringify(rounded.coordinates).split("],[").length;
    report.push(`${lake.label}: ${kept.length} part(s), ${Math.round(km2)} km² inside the outline, ${points} points, pixel ${pixelKm.toFixed(2)} km`);
    console.log(report.at(-1));
  }
  await save("lakes.json", new Blob([JSON.stringify({ type: "FeatureCollection", features })], { type: "application/json" }));
  console.log(report.join("\n"));
  return report.join("\n");
})();
