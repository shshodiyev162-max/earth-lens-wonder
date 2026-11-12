import { describe, expect, it } from "vitest";
import { yearTicks } from "../chartTicks";
import { monthRange } from "@/lib/gibs/time";

describe("yearTicks", () => {
  it("labels the start of each year when there is room", () => {
    expect(yearTicks(monthRange("2020-01", "2023-12"))).toEqual(["2020-01", "2021-01", "2022-01", "2023-01"]);
  });

  it("skips a first year that holds only its last months, so two labels never touch", () => {
    expect(yearTicks(monthRange("2019-11", "2022-12"))).toEqual(["2020-01", "2021-01", "2022-01"]);
  });

  it("thins a long record but always labels the newest year", () => {
    const ticks = yearTicks(monthRange("2001-01", "2025-12"));
    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(ticks[ticks.length - 1]).toBe("2025-01");
    const gaps = ticks.slice(1).map((tick, i) => Number(tick.slice(0, 4)) - Number(ticks[i].slice(0, 4)));
    expect(new Set(gaps).size).toBe(1);
  });

  it("works when only some months of each year were asked for", () => {
    const summers = [2020, 2021, 2022].flatMap((year) => [`${year}-06`, `${year}-07`, `${year}-08`]);
    expect(yearTicks(summers)).toEqual(["2020-06", "2021-06", "2022-06"]);
  });

  it("copes with one year or none", () => {
    expect(yearTicks(monthRange("2024-01", "2024-12"))).toEqual(["2024-01"]);
    expect(yearTicks([])).toEqual([]);
  });
});
