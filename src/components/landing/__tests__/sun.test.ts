import { describe, expect, it, vi } from "vitest";
import {
  AUTO_SECONDS_PER_DAY,
  advanceAuto,
  createHourStore,
  dayOfYear,
  easeHourTowards,
  formatUtc,
  hourDelta,
  latLonToSphere,
  subsolarPoint,
  utcHours,
  wrapHours,
} from "../sun";

const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);

describe("time helpers", () => {
  it("reads UTC hours and day of year", () => {
    const date = new Date(Date.UTC(2026, 2, 21, 14, 30, 0));
    expect(utcHours(date)).toBe(14.5);
    expect(dayOfYear(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
    expect(dayOfYear(date)).toBe(80);
    expect(dayOfYear(new Date(Date.UTC(2024, 11, 31)))).toBe(366);
  });

  it("wraps hours and finds the short way round the clock", () => {
    expect(wrapHours(25)).toBe(1);
    expect(wrapHours(-1)).toBe(23);
    expect(hourDelta(23, 1)).toBe(2);
    expect(hourDelta(1, 23)).toBe(-2);
    expect(hourDelta(6, 18)).toBe(12);
  });

  it("formats the clock label", () => {
    expect(formatUtc(14 + 5 / 60)).toBe("14:05 UTC");
    expect(formatUtc(0)).toBe("00:00 UTC");
    expect(formatUtc(23.9999)).toBe("23:59 UTC");
    expect(formatUtc(-0.5)).toBe("23:30 UTC");
    expect(formatUtc(110 / 60)).toBe("01:50 UTC");
  });
});

describe("subsolarPoint", () => {
  it("puts the sun over Greenwich at noon UTC", () => {
    expect(subsolarPoint(81, 12)).toEqual({ lat: 0, lon: 0 });
  });

  it("moves 15° west per hour", () => {
    close(subsolarPoint(81, 18).lon, -90);
    close(subsolarPoint(81, 6).lon, 90);
    close(subsolarPoint(81, 0).lon, -180);
  });

  it("follows the seasons", () => {
    expect(subsolarPoint(172, 12).lat).toBeGreaterThan(23); // June solstice
    expect(subsolarPoint(355, 12).lat).toBeLessThan(-23); // December solstice
  });
});

describe("latLonToSphere", () => {
  it("matches three.js SphereGeometry texture coordinates", () => {
    const [x, y, z] = latLonToSphere(0, 0);
    close(x, 1);
    close(y, 0);
    close(z, 0);
    const north = latLonToSphere(90, 0);
    close(north[1], 1);
    const east = latLonToSphere(0, 90);
    close(east[0], 0);
    close(east[2], -1);
  });

  it("returns unit vectors", () => {
    const [x, y, z] = latLonToSphere(41.3, 69.2);
    close(Math.hypot(x, y, z), 1);
  });
});

describe("Auto and easing", () => {
  it("passes a whole day in AUTO_SECONDS_PER_DAY seconds", () => {
    close(advanceAuto(10, AUTO_SECONDS_PER_DAY), 10);
    close(advanceAuto(10, AUTO_SECONDS_PER_DAY / 4), 16);
  });

  it("eases towards the target the short way round", () => {
    const next = easeHourTowards(23, 1, 0.1);
    expect(next).toBeGreaterThan(23);
    expect(easeHourTowards(23, 1, 10)).toBe(1);
    expect(easeHourTowards(5, 5, 0.1)).toBe(5);
  });
});

describe("createHourStore", () => {
  it("only notifies when the shown minute changes", () => {
    const store = createHourStore(12);
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.set(12 + 0.2 / 60);
    expect(listener).not.toHaveBeenCalled();
    store.set(12 + 1 / 60);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toBeCloseTo(12 + 1 / 60);
    stop();
    store.set(13);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
