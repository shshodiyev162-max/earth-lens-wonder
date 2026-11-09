import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { latLonToSphere } from "../home";
import { ease, faceRotation, fitRadius, lonDelta, poseAt, stopAt, STOPS, type Stop } from "../story";

const spin = { lat: 10, lon: 50 };

describe("stopAt", () => {
  const centres = [0, 1000, 2000, 4000];

  it("stays inside the stops at both ends of the page", () => {
    expect(stopAt(-50, centres)).toBe(0);
    expect(stopAt(0, centres)).toBe(0);
    expect(stopAt(9999, centres)).toBe(3);
  });

  it("holds still around a stop, so the planet doesn't drift while the words are read", () => {
    expect(stopAt(1000, centres)).toBe(1);
    expect(stopAt(1100, centres)).toBe(1);
    expect(stopAt(950, centres)).toBe(1);
  });

  it("moves between stops, always forwards", () => {
    let previous = -1;
    for (let scroll = 0; scroll <= 4000; scroll += 25) {
      const place = stopAt(scroll, centres);
      expect(place).toBeGreaterThanOrEqual(previous);
      previous = place;
    }
    expect(stopAt(1500, centres)).toBeCloseTo(1.5);
    expect(stopAt(3000, centres)).toBeCloseTo(2.5);
  });

  it("copes with a page that hasn't been measured yet", () => {
    expect(stopAt(500, [])).toBe(0);
  });
});

describe("ease", () => {
  it("starts and ends still", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });
});

describe("lonDelta", () => {
  it("goes the short way round", () => {
    expect(lonDelta(170, -170)).toBe(20);
    expect(lonDelta(-170, 170)).toBe(-20);
    expect(lonDelta(10, 40)).toBe(30);
    expect(lonDelta(40, 10)).toBe(-30);
    expect(lonDelta(0, 180)).toBe(180);
  });
});

describe("poseAt", () => {
  it("reaches every place the story stops at", () => {
    STOPS.forEach((stop, index) => {
      const pose = poseAt(index, spin, false);
      expect(pose.lat).toBeCloseTo(stop.lat ?? spin.lat);
      expect(pose.lon).toBeCloseTo(stop.lon ?? spin.lon);
      expect(pose.zoom).toBeCloseTo(stop.zoom);
      expect(pose.x).toBeCloseTo(stop.wide[0]);
    });
  });

  it("uses the upright layout on upright screens", () => {
    expect(poseAt(2, spin, true).y).toBeCloseTo(STOPS[2].upright[1]);
    expect(poseAt(2, spin, false).y).toBeCloseTo(STOPS[2].wide[1]);
  });

  it("lets the visitor turn the planet only at the free-spinning stops", () => {
    expect(poseAt(0, spin, false).free).toBe(1);
    expect(poseAt(3, spin, false).free).toBe(0);
    expect(poseAt(STOPS.length - 1, spin, false).free).toBe(1);
  });

  it("shows a measured map fully at its own stop and never slides it across other places", () => {
    expect(poseAt(2, spin, false)).toMatchObject({ data: "mediterranean", dataAmount: 1 });
    expect(poseAt(3, spin, false)).toMatchObject({ data: "uzbekistan", dataAmount: 1 });
    expect(poseAt(3.5, spin, false)).toMatchObject({ data: "uzbekistan", dataAmount: 1 });
    expect(poseAt(5, spin, false)).toMatchObject({ data: "antarctica", dataAmount: 1 });
    // Halfway between two different maps, neither shows.
    expect(poseAt(2.5, spin, false).dataAmount).toBe(0);
    expect(poseAt(4.5, spin, false).dataAmount).toBe(0);
    expect(poseAt(0, spin, false).dataAmount).toBe(0);
  });

  it("goes round the short way between stops", () => {
    const stops: Stop[] = [
      { lat: 0, lon: 170, zoom: 1, wide: [0, 0], upright: [0, 0], clouds: 1, data: null },
      { lat: 0, lon: -170, zoom: 1, wide: [0, 0], upright: [0, 0], clouds: 1, data: null },
    ];
    expect(poseAt(0.5, spin, false, stops).lon).toBeCloseTo(180);
  });

  it("zooms evenly in ratio, not in size", () => {
    const stops: Stop[] = [
      { lat: 0, lon: 0, zoom: 1, wide: [0, 0], upright: [0, 0], clouds: 1, data: null },
      { lat: 0, lon: 0, zoom: 4, wide: [0, 0], upright: [0, 0], clouds: 1, data: null },
    ];
    expect(poseAt(0.5, spin, false, stops).zoom).toBeCloseTo(2);
  });

  it("stays inside the story for any place", () => {
    expect(poseAt(-3, spin, false).lat).toBeCloseTo(spin.lat);
    expect(poseAt(99, spin, false).zoom).toBeCloseTo(STOPS[STOPS.length - 1].zoom);
  });
});

describe("faceRotation", () => {
  const places: [number, number][] = [
    [0, 0],
    [36.5, 18],
    [41.5, 63.5],
    [44, 59.5],
    [-82, 40],
    [20, -120],
    [-33, 151],
  ];

  it("brings the place to the middle of the disc", () => {
    for (const [lat, lon] of places) {
      const { x, y } = faceRotation(lat, lon);
      const turned = new THREE.Vector3(...latLonToSphere(lat, lon)).applyEuler(new THREE.Euler(x, y, 0));
      expect(turned.x).toBeCloseTo(0);
      expect(turned.y).toBeCloseTo(0);
      expect(turned.z).toBeCloseTo(1);
    }
  });

  it("keeps north up and east to the right", () => {
    const { x, y } = faceRotation(30, 40);
    const euler = new THREE.Euler(x, y, 0);
    const north = new THREE.Vector3(...latLonToSphere(31, 40)).applyEuler(euler);
    const east = new THREE.Vector3(...latLonToSphere(30, 41)).applyEuler(euler);
    expect(north.y).toBeGreaterThan(0);
    expect(Math.abs(north.x)).toBeLessThan(1e-6);
    expect(east.x).toBeGreaterThan(0);
  });
});

describe("fitRadius", () => {
  it("leaves room for the words on a wide screen", () => {
    const radius = fitRadius(1440, 900);
    expect(radius).toBeLessThan(1440 * 0.4);
    expect(radius).toBeGreaterThan(900 * 0.4);
  });

  it("fills an upright screen's width", () => {
    expect(fitRadius(390, 844)).toBeGreaterThan(390 * 0.75);
  });
});
