import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cloudImagePath, dayImagePath, FIRST_IMAGE, sharpCloudImageSize, sharpDayImageSize } from "../earthTextures";

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
