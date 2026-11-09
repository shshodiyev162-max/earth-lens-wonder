import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA_DISTANCE, EDGE_ON_MIDDLE_PLANE, flickSpeed, HORIZON_HEIGHT, lensFor, onScreen, orientationFacing, tiltBy, TILT_LIMIT, turnGlobe, type View } from "../globeDrag";
import { latLonToSphere } from "../home";

const ROLL = -0.2;
const inCameraFrame = (view: View, roll: number, lat: number, lon: number) => new THREE.Vector3(...latLonToSphere(lat, lon)).applyQuaternion(orientationFacing(view.lat, view.lon, roll));
const northOf = (view: View, roll: number) => new THREE.Vector3(0, 1, 0).applyQuaternion(orientationFacing(view.lat, view.lon, roll));

describe("turning the globe", () => {
  it("can never end up upside down or sideways, whatever the hand does", () => {
    let view: View = { lat: 20, lon: 40 };
    let seed = 12345;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647 - 0.5;
    };
    for (let i = 0; i < 5000; i++) {
      view = turnGlobe(view, random() * 300, random() * 300, 500);
      expect(Math.abs(view.lat)).toBeLessThanOrEqual(TILT_LIMIT);
      const north = northOf(view, ROLL);
      expect(north.y).toBeGreaterThan(0.25); // North is always towards the top of the screen.
      expect(Math.abs(Math.atan2(north.x, north.y) + ROLL)).toBeLessThan(1e-9); // And never leans more than the planet's own lean.
    }
  });

  it("stays upright when dragged hard towards either pole", () => {
    for (const direction of [1, -1]) {
      let view: View = { lat: 0, lon: 0 };
      for (let i = 0; i < 2000; i++) view = turnGlobe(view, 0, direction * 40, 500);
      expect(Math.abs(view.lat)).toBeLessThanOrEqual(TILT_LIMIT);
      expect(Math.abs(view.lat)).toBeGreaterThan(TILT_LIMIT - 4);
      expect(northOf(view, 0).y).toBeGreaterThan(0.25);
    }
  });

  it("turns at the same speed wherever the planet faces", () => {
    for (const lat of [0, 30, 60, 72, -72, -45]) {
      const moved = turnGlobe({ lat, lon: 10 }, 50, 0, 500);
      expect(moved.lon - 10).toBeCloseTo((-50 / 500) * (180 / Math.PI), 9);
      expect(moved.lat).toBe(lat);
    }
    for (const lat of [0, 20, -20, 40, -40]) {
      const moved = turnGlobe({ lat, lon: 10 }, 0, 50, 500);
      expect(Math.abs(moved.lat - lat)).toBeCloseTo((50 / 500) * (180 / Math.PI), 9);
    }
  });

  it("moves the surface the way the hand moves", () => {
    const view = { lat: 10, lon: 40 };
    const place = (next: View) => inCameraFrame(next, 0, 10, 40);
    expect(place(turnGlobe(view, 50, 0, 500)).x).toBeGreaterThan(0);
    expect(place(turnGlobe(view, -50, 0, 500)).x).toBeLessThan(0);
    expect(place(turnGlobe(view, 0, 50, 500)).y).toBeGreaterThan(0);
    expect(place(turnGlobe(view, 0, -50, 500)).y).toBeLessThan(0);
  });

  it("keeps the ground at the middle of the disc under the hand", () => {
    const { focal, pixelsPerRadian } = lensFor(424);
    const near = { lat: 0, lon: 30 };
    const across = onScreen(inCameraFrame(turnGlobe(near, 6, 0, pixelsPerRadian), 0, 0, 30), focal);
    expect(across.x).toBeCloseTo(6, 1);
    expect(across.y).toBeCloseTo(0, 6);
    const up = onScreen(inCameraFrame(turnGlobe(near, 0, 6, pixelsPerRadian), 0, 0, 30), focal);
    expect(up.y).toBeCloseTo(6, 1);
    expect(up.x).toBeCloseTo(0, 6);
  });

  it("gives the same turn for one long move as for many small ones, away from the limit", () => {
    const once = turnGlobe({ lat: 5, lon: 30 }, 300, -120, 500);
    let many: View = { lat: 5, lon: 30 };
    for (let i = 0; i < 60; i++) many = turnGlobe(many, 5, -2, 500);
    expect(many.lat).toBeCloseTo(once.lat, 6);
    expect(many.lon).toBeCloseTo(once.lon, 6);
  });

  it("does nothing when the hand doesn't move", () => {
    expect(turnGlobe({ lat: 30, lon: 30 }, 0, 0, 500)).toEqual({ lat: 30, lon: 30 });
  });
});

describe("tiltBy", () => {
  it("is free in the middle of the range", () => {
    expect(tiltBy(10, 5)).toBe(15);
    expect(tiltBy(-10, -5)).toBe(-15);
  });

  it("slows down smoothly near the limit instead of hitting a wall", () => {
    let lat = 50;
    let previous = Infinity;
    for (let i = 0; i < 30; i++) {
      const next = tiltBy(lat, 1);
      const step = next - lat;
      expect(step).toBeLessThanOrEqual(previous + 1e-12);
      expect(step).toBeGreaterThanOrEqual(0);
      previous = step;
      lat = next;
    }
    expect(lat).toBeLessThanOrEqual(TILT_LIMIT);
  });

  it("never slows you coming back from the limit", () => {
    expect(tiltBy(TILT_LIMIT, -5)).toBe(TILT_LIMIT - 5);
    expect(tiltBy(-TILT_LIMIT, 5)).toBe(-TILT_LIMIT + 5);
  });
});

describe("the lens", () => {
  it("puts the planet's visible edge exactly at the radius asked for", () => {
    const radius = 424;
    const { focal } = lensFor(radius);
    // The edge is where the line of sight just grazes the sphere.
    const across = Math.sqrt(1 - HORIZON_HEIGHT * HORIZON_HEIGHT);
    const edge = onScreen({ x: across, y: 0, z: HORIZON_HEIGHT }, focal);
    expect(edge.x).toBeCloseTo(radius, 6);
  });

  it("really is perspective: nearer ground looks bigger, gently", () => {
    const { focal } = lensFor(400);
    const atMiddle = onScreen({ x: 0.01, y: 0, z: Math.sqrt(1 - 0.0001) }, focal).x;
    const atEdge = onScreen({ x: 0.01, y: 0, z: 0 }, focal).x;
    const swell = atMiddle / atEdge;
    expect(swell).toBeGreaterThan(1.1);
    expect(swell).toBeLessThan(1.5);
  });

  it("shows a real depth of view: less than a full half of the planet", () => {
    const visibleDegrees = (Math.acos(HORIZON_HEIGHT) * 180) / Math.PI;
    expect(visibleDegrees).toBeGreaterThan(70);
    expect(visibleDegrees).toBeLessThan(85);
  });

  it("gives the flat air sheet the size of the planet's edge", () => {
    const { focal } = lensFor(424);
    expect(onScreen({ x: EDGE_ON_MIDDLE_PLANE, y: 0, z: 0 }, focal).x).toBeCloseTo(424, 6);
    expect(CAMERA_DISTANCE).toBeGreaterThan(1);
  });
});

describe("orientationFacing", () => {
  it("puts the place at the middle, with north up", () => {
    const place = inCameraFrame({ lat: 30, lon: 40 }, 0, 30, 40);
    expect(place.z).toBeCloseTo(1);
    const north = northOf({ lat: 30, lon: 40 }, 0);
    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeGreaterThan(0);
  });

  it("leans the planet without moving its middle", () => {
    expect(inCameraFrame({ lat: 30, lon: 40 }, ROLL, 30, 40).z).toBeCloseTo(1);
    const north = northOf({ lat: 30, lon: 40 }, ROLL);
    expect(Math.atan2(north.x, north.y)).toBeCloseTo(0.2);
  });
});

describe("flickSpeed", () => {
  const drag = [
    { time: 900, x: 0, y: 0 },
    { time: 950, x: 50, y: 10 },
    { time: 1000, x: 100, y: 20 },
  ];

  it("carries on at the speed of the last moment of the drag", () => {
    const speed = flickSpeed(drag, 1005, 500);
    // 100 pixels in 0.1 s at 500 pixels a radian is 2 radians a second.
    expect(speed.x).toBeCloseTo(2, 5);
    expect(speed.y).toBeCloseTo(0.4, 5);
  });

  it("does nothing if you stopped before letting go", () => {
    expect(flickSpeed(drag, 1100, 500)).toEqual({ x: 0, y: 0 });
    expect(flickSpeed(drag, 5000, 500)).toEqual({ x: 0, y: 0 });
  });

  it("does nothing for a press without a real move", () => {
    expect(flickSpeed([], 1000, 500)).toEqual({ x: 0, y: 0 });
    expect(flickSpeed([{ time: 1000, x: 3, y: 3 }], 1000, 500)).toEqual({ x: 0, y: 0 });
  });

  it("limits how hard a flick can spin the planet, keeping its direction", () => {
    const fast = flickSpeed(
      [
        { time: 990, x: 0, y: 0 },
        { time: 1000, x: 3000, y: 4000 },
      ],
      1000,
      500,
    );
    expect(Math.hypot(fast.x, fast.y)).toBeCloseTo(2.6);
    expect(fast.y / fast.x).toBeCloseTo(4 / 3);
  });
});
