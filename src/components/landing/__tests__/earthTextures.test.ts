import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cloudImagePath, dayImagePath, DETAIL_IMAGE, FIRST_IMAGE, openingDayImageSize, pictureBox, sharpCloudImageSize, sharpDayImageSize, wantsDetailImage } from "../earthTextures";
import { FINDINGS } from "../findings";

const desktop = { screenWidth: 1440, touch: false, maxTextureSize: 16384, saveData: false };
const phone = { ...desktop, screenWidth: 390, touch: true };

describe("sharpDayImageSize", () => {
  it("gives large screens the sharpest image", () => {
    expect(sharpDayImageSize(desktop)).toBe(8192);
  });

  it("gives phones and tablets the middle image, even with a capable graphics card", () => {
    expect(sharpDayImageSize(phone)).toBe(4096);
    expect(sharpDayImageSize({ ...desktop, screenWidth: 1280, touch: true })).toBe(4096);
  });

  it("gives a small window the middle image", () => {
    expect(sharpDayImageSize({ ...desktop, screenWidth: 800 })).toBe(4096);
  });

  it("never asks for more than the graphics card can hold", () => {
    expect(sharpDayImageSize({ ...desktop, maxTextureSize: 8192 })).toBe(8192);
    expect(sharpDayImageSize({ ...desktop, maxTextureSize: 4096 })).toBe(4096);
    expect(sharpDayImageSize({ ...desktop, maxTextureSize: 2048 })).toBe(FIRST_IMAGE);
  });

  it("stays on the first image when the visitor asked to save data", () => {
    expect(sharpDayImageSize({ ...desktop, saveData: true })).toBe(FIRST_IMAGE);
  });
});

describe("sharpCloudImageSize", () => {
  it("gives large screens the sharper clouds", () => {
    expect(sharpCloudImageSize(desktop)).toBe(4096);
  });

  it("keeps the first image on phones, tablets and small windows", () => {
    expect(sharpCloudImageSize(phone)).toBe(FIRST_IMAGE);
    expect(sharpCloudImageSize({ ...desktop, touch: true })).toBe(FIRST_IMAGE);
    expect(sharpCloudImageSize({ ...desktop, screenWidth: 800 })).toBe(FIRST_IMAGE);
  });

  it("never asks for more than the graphics card can hold", () => {
    expect(sharpCloudImageSize({ ...desktop, maxTextureSize: 4096 })).toBe(4096);
    expect(sharpCloudImageSize({ ...desktop, maxTextureSize: 2048 })).toBe(FIRST_IMAGE);
  });

  it("stays on the first image when the visitor asked to save data", () => {
    expect(sharpCloudImageSize({ ...desktop, saveData: true })).toBe(FIRST_IMAGE);
  });
});

describe("image paths", () => {
  it("point at images that are bundled with the app, for every size", () => {
    for (const size of [2048, 4096, 8192] as const) {
      expect(existsSync(`public/${dayImagePath(size)}`)).toBe(true);
    }
    const device = { screenWidth: 1440, touch: false, maxTextureSize: 16384, saveData: false };
    expect(existsSync(`public/${cloudImagePath(FIRST_IMAGE)}`)).toBe(true);
    expect(existsSync(`public/${cloudImagePath(sharpCloudImageSize(device))}`)).toBe(true);
  });
});

describe("the sharper picture of Central Asia", () => {
  it("is bundled, and covers the story's close looks at Uzbekistan and the Aral Sea shore", () => {
    expect(existsSync(`public/${DETAIL_IMAGE.path}`)).toBe(true);
    const [west, south, east, north] = DETAIL_IMAGE.bbox;
    const inside = ([lat, lon]: readonly number[]) => lon > west && lon < east && lat > south && lat < north;
    // Uzbekistan from end to end, and the Muynoq district by the old Aral Sea.
    for (const point of [[43.6, 60.2], [41.5, 64], [37.2, 67.3], [45.5, 56.0], [41.0, 73.1]]) expect(inside(point), point.join(", ")).toBe(true);
    expect(inside(FINDINGS.uzbekistan.hotspot.center), "the Muynoq hotspot").toBe(true);
  });

  it("sits on the planet's picture where its degrees say", () => {
    expect(pictureBox([-180, -90, 180, 90])).toEqual([0, 0, 1, 1]);
    const [u0, v0, u1, v1] = pictureBox(DETAIL_IMAGE.bbox);
    expect(u0).toBeCloseTo(224 / 360, 6);
    expect(v0).toBeCloseTo(124 / 180, 6);
    expect(u1).toBeCloseTo(256 / 360, 6);
    expect(v1).toBeCloseTo(142 / 180, 6);
  });

  it("is fetched only once the story heads past its opening, and never when saving data", () => {
    expect(wantsDetailImage(0, false)).toBe(false);
    expect(wantsDetailImage(1.2, false)).toBe(false);
    expect(wantsDetailImage(1.5, false)).toBe(true);
    expect(wantsDetailImage(4, false)).toBe(true);
    expect(wantsDetailImage(4, true)).toBe(false);
  });
});

describe("openingDayImageSize", () => {
  it("opens with the middle image, keeping the sharpest for when the story zooms in", () => {
    expect(openingDayImageSize(desktop)).toBe(4096);
    expect(sharpDayImageSize(desktop)).toBe(8192);
    expect(openingDayImageSize(phone)).toBe(4096);
    expect(openingDayImageSize({ ...desktop, maxTextureSize: 2048 })).toBe(FIRST_IMAGE);
    expect(openingDayImageSize({ ...desktop, saveData: true })).toBe(FIRST_IMAGE);
  });
});
