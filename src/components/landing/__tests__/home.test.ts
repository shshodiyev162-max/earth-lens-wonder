import { describe, expect, it } from "vitest";
import { findHome, formatLocalClock, latLonToSphere } from "../home";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("findHome", () => {
  it("finds the city of a time zone", () => {
    expect(findHome("Asia/Tashkent")).toEqual({ city: "Tashkent", lat: 41.3, lon: 69.3 });
    expect(findHome("America/New_York")?.city).toBe("New York");
    expect(findHome("America/Argentina/Buenos_Aires")?.city).toBe("Buenos Aires");
  });

  it("understands older names browsers still report", () => {
    expect(findHome("Asia/Calcutta")?.city).toBe("Kolkata");
    expect(findHome("Europe/Kiev")?.city).toBe("Kyiv");
  });

  it("returns nothing when there is no place to mark", () => {
    expect(findHome(undefined)).toBeNull();
    expect(findHome("UTC")).toBeNull();
    expect(findHome("Etc/GMT+5")).toBeNull();
    expect(findHome("Nowhere/Special")).toBeNull();
  });
});

describe("formatLocalClock", () => {
  it("shows the visitor's own time with two digits each", () => {
    expect(formatLocalClock(new Date(2026, 0, 5, 14, 5))).toBe("14:05");
    expect(formatLocalClock(new Date(2026, 0, 5, 0, 0))).toBe("00:00");
    expect(formatLocalClock(new Date(2026, 0, 5, 9, 30))).toBe("09:30");
  });
});

describe("latLonToSphere", () => {
  it("matches three.js SphereGeometry texture coordinates", () => {
    const [x, y, z] = latLonToSphere(0, 0);
    close(x, 1);
    close(y, 0);
    close(z, 0);
    close(latLonToSphere(90, 0)[1], 1);
    const east = latLonToSphere(0, 90);
    close(east[0], 0);
    close(east[2], -1);
  });

  it("returns unit vectors", () => {
    const [x, y, z] = latLonToSphere(41.3, 69.2);
    close(Math.hypot(x, y, z), 1);
  });
});
