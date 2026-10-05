import { describe, expect, it } from "vitest";
import { sanitizeInterpretation } from "../ai";

describe("sanitizeInterpretation", () => {
  it("keeps a well-formed answer", () => {
    expect(sanitizeInterpretation({ indicator: "heat", direction: "increase", place: "Cairo", time: { kind: "since", start: 2010 } })).toEqual({
      indicator: "heat",
      direction: "increase",
      place: "Cairo",
      time: { kind: "since", start: 2010 },
    });
  });

  it("drops unknown or malformed fields", () => {
    expect(sanitizeInterpretation({ indicator: "ozone" })).toBeNull();
    expect(sanitizeInterpretation("text")).toBeNull();
    expect(sanitizeInterpretation({ indicator: "dust", direction: "sideways", place: 42, time: { kind: "since", start: 1200 } })).toEqual({
      indicator: "dust",
      direction: "any",
      place: null,
      time: { kind: "default" },
    });
    expect(sanitizeInterpretation({ indicator: "snow", time: { kind: "range", start: 2020, end: 2012 } })?.time).toEqual({ kind: "range", start: 2012, end: 2020 });
  });
});
