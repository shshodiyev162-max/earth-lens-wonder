import { describe, expect, it } from "vitest";
import { addMonths, availableMonths, monthRange, parseDomainXml, parsePeriod, resolveInDomain } from "../time";

const DAILY = `<Domains><DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2000-06-01/2025-10-22/P1D,2025-10-30/2026-01-07/P1D,2026-01-09/2026-09-30/P1D</Domain><Size>3</Size></DimensionDomain></Domains>`;
const SIXTEEN = `<Domains><DimensionDomain><Domain>2025-01-01/2025-12-19/P16D,2026-01-01/2026-08-29/P16D</Domain></DimensionDomain></Domains>`;
const MONTHLY = `<Domains><DimensionDomain><Domain>2000-03-01/2025-03-01/P1M,2025-05-01/2026-08-01/P1M</Domain></DimensionDomain></Domains>`;

describe("parseDomainXml", () => {
  it("reads intervals, earliest and latest", () => {
    const domain = parseDomainXml(DAILY);
    expect(domain?.intervals).toHaveLength(3);
    expect(domain?.earliest).toBe("2000-06-01");
    expect(domain?.latest).toBe("2026-09-30");
  });
  it("returns null for responses without a domain", () => {
    expect(parseDomainXml("<ExceptionReport/>")).toBeNull();
  });
});

describe("resolveInDomain", () => {
  const daily = parseDomainXml(DAILY)!;
  const sixteen = parseDomainXml(SIXTEEN)!;
  const monthly = parseDomainXml(MONTHLY)!;

  it("keeps available days", () => {
    expect(resolveInDomain(daily, "2024-05-05")).toEqual({ requested: "2024-05-05", date: "2024-05-05", resolution: "exact" });
  });

  it("moves gap days to the nearest available day", () => {
    expect(resolveInDomain(daily, "2025-10-24")).toMatchObject({ date: "2025-10-22", resolution: "gap" });
    expect(resolveInDomain(daily, "2025-10-28")).toMatchObject({ date: "2025-10-30", resolution: "gap" });
  });

  it("clamps to the latest and earliest dates", () => {
    expect(resolveInDomain(daily, "2026-10-02")).toMatchObject({ date: "2026-09-30", resolution: "latest" });
    expect(resolveInDomain(daily, "1999-01-01")).toMatchObject({ date: "2000-06-01", resolution: "earliest" });
  });

  it("snaps to the start of 16-day and monthly composites", () => {
    expect(resolveInDomain(sixteen, "2026-08-05")).toMatchObject({ date: "2026-07-28", resolution: "snapped" });
    expect(resolveInDomain(sixteen, "2026-09-20")).toMatchObject({ date: "2026-08-29", resolution: "latest" });
    expect(resolveInDomain(monthly, "2026-06-15")).toMatchObject({ date: "2026-06-01", resolution: "snapped" });
    expect(resolveInDomain(monthly, "2025-04-10")).toMatchObject({ resolution: "gap" });
  });

  it("lists available months inside a range", () => {
    expect(availableMonths(monthly, "2025-02", "2025-06")).toEqual(["2025-02", "2025-03", "2025-05", "2025-06"]);
  });
});

describe("date helpers", () => {
  it("builds inclusive month ranges across years", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("adds months without overflowing short months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("parses ISO periods", () => {
    expect(parsePeriod("P16D")).toEqual({ days: 16, months: 0 });
    expect(parsePeriod("P1M")).toEqual({ days: 0, months: 1 });
    expect(parsePeriod("P1Y")).toEqual({ days: 0, months: 12 });
  });
});
