// Puts a recent NASA picture of the Aral Sea into the home globe's sharp picture of Central Asia
// (public/textures/earth_day_central_asia.jpg, NASA's Blue Marble, which shows the sea as it was in
// 2004). The new piece is MODIS Terra true colour from a cloud-free day, colour-matched to the Blue
// Marble around it and faded in at its edges, so the globe shows today's dried-up sea.
//
//   1. npm run data:earth -- earth_day_central_asia.jpg (the Blue Marble piece), then npm run dev.
//   2. Open any page of the app, paste this whole file into the browser's console, press Enter.
//   3. It downloads earth_day_central_asia.jpg: put it in public/textures.

(async () => {
  const DATE = "2025-08-18"; // checked against the days around it: no cloud over the region
  const LAYER = "MODIS_Terra_CorrectedReflectance_TrueColor";
  // The Central Asia picture: west, south, east, north, and its degrees a pixel.
  const BASE = { west: 44, north: 52, step: 0.0125, width: 2560, height: 1440 };
  // The recent piece: the Aral Sea, its old shore and the Amu Darya delta.
  const PIECE = { west: 56.5, south: 42.5, east: 63.5, north: 47.5 };
  const FADE = 48; // pixels of fade at each edge

  const save =
    window.__terrascopeSave ??
    ((name, blob) => {
      const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
      link.click();
      URL.revokeObjectURL(link.href);
    });
  const load = async (url) => createImageBitmap(await (await fetch(url)).blob());

  const base = await load("/textures/earth_day_central_asia.jpg");
  const width = Math.round((PIECE.east - PIECE.west) / BASE.step);
  const height = Math.round((PIECE.north - PIECE.south) / BASE.step);
  const x0 = Math.round((PIECE.west - BASE.west) / BASE.step);
  const y0 = Math.round((BASE.north - PIECE.north) / BASE.step);
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: LAYER,
    STYLES: "",
    CRS: "EPSG:4326",
    BBOX: [PIECE.south, PIECE.west, PIECE.north, PIECE.east].join(","),
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: "image/png",
    TIME: DATE,
  });
  const piece = await load(`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`);

  const canvas = new OffscreenCanvas(BASE.width, BASE.height);
  const context = canvas.getContext("2d");
  context.drawImage(base, 0, 0);
  const under = context.getImageData(x0, y0, width, height);
  const scratch = new OffscreenCanvas(width, height).getContext("2d");
  scratch.drawImage(piece, 0, 0);
  const over = scratch.getImageData(0, 0, width, height);

  // Colour match on the ring where the two meet: each channel scaled to the Blue Marble's mean there.
  const sum = [
    [0, 0, 0],
    [0, 0, 0],
  ];
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (Math.min(x, y, width - 1 - x, height - 1 - y) >= FADE) continue;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        sum[0][c] += under.data[i + c];
        sum[1][c] += over.data[i + c];
      }
      count += 1;
    }
  }
  const gain = [0, 1, 2].map((c) => Math.min(1.3, Math.max(0.7, sum[0][c] / Math.max(1, sum[1][c]))));

  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = smooth(Math.min(1, Math.min(x, y, width - 1 - x, height - 1 - y) / FADE));
      for (let c = 0; c < 3; c++) under.data[i + c] = Math.round((1 - a) * under.data[i + c] + a * Math.min(255, over.data[i + c] * gain[c]));
    }
  }
  context.putImageData(under, x0, y0);
  save("earth_day_central_asia.jpg", await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 }));
  console.log("Done.", { date: DATE, gain: gain.map((g) => g.toFixed(3)), ringPixels: count });
})();
