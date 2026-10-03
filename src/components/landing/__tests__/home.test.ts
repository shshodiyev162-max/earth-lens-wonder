import { describe, expect, it } from "vitest";
import { findHome } from "../home";

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
