import { describe, expect, it } from "vitest";
import { addMonths, availableMonths, clipDomain, completeDaysAgoUtc, defaultDateFor, firstDateInMonth, formatLayerDate, monthRange, monthsInDomain, parseDomainXml, parsePeriod, provisionalDate, resolveForLayer, resolveInDomain, waitsForDates } from "../time";
import { getLayer, type GibsLayer } from "../catalog";

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

describe("completeDaysAgoUtc", () => {
  it("uses yesterday once NASA has had time to process it", () => {
    expect(completeDaysAgoUtc(1, new Date("2026-10-02T16:50:00Z"))).toBe("2026-10-01");
  });

  it("falls back a day early in the UTC morning, while yesterday is still incomplete", () => {
    expect(completeDaysAgoUtc(1, new Date("2026-10-02T03:00:00Z"))).toBe("2026-09-30");
  });

  it("returns today for a lag of zero", () => {
    expect(completeDaysAgoUtc(0, new Date("2026-10-02T03:00:00Z"))).toBe("2026-10-02");
  });
});

// A real stretch of the GRACE list: uneven dates, months with none, and dates listed past the real end of the record.
const GRACE = `<Domains><DimensionDomain><Domain>2002-04-04/2002-04-04/P28D,2002-05-02/2002-05-02/P17D,2002-08-01/2003-04-01/P1M,2011-02-08/2011-02-08/P21D,2011-10-01/2011-10-01/P16D,2011-10-17/2011-10-17/P31D,2016-11-14/2016-12-11/P27D,2017-05-23/2017-05-23/P38D,2018-06-01/2018-06-01/P1M,2019-03-01/2022-12-01/P1M,2020-01-20/2020-01-10/P1M,2020-02-01/2022-07-01/P1M</Domain></DimensionDomain></Domains>`;

describe("products published on uneven dates", () => {
  const domain = clipDomain(parseDomainXml(GRACE), "2022-07")!;

  it("finds the date NASA lists in a month", () => {
    expect(firstDateInMonth(domain, "2002-04")).toBe("2002-04-04");
    expect(firstDateInMonth(domain, "2002-09")).toBe("2002-09-01");
    expect(firstDateInMonth(domain, "2011-02")).toBe("2011-02-08");
    expect(firstDateInMonth(domain, "2016-12")).toBe("2016-12-11");
    // Two dates in one month: the first.
    expect(firstDateInMonth(domain, "2011-10")).toBe("2011-10-01");
  });

  it("knows the months with no map", () => {
    expect(firstDateInMonth(domain, "2002-06")).toBeNull();
    expect(firstDateInMonth(domain, "2017-08")).toBeNull();
  });

  it("stops at the real end of the record, whatever NASA's list says", () => {
    expect(domain.latest).toBe("2022-07-31");
    expect(firstDateInMonth(domain, "2022-07")).toBe("2022-07-01");
    expect(firstDateInMonth(domain, "2022-08")).toBeNull();
    expect(clipDomain(parseDomainXml(GRACE))?.latest).toBe("2022-12-01");
  });

  it("lists only the months that have a map", () => {
    const layer = getLayer("GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI") as GibsLayer;
    expect(layer.irregularDates).toBe(true);
    expect(monthsInDomain(layer, domain, "2002-03", "2002-09")).toEqual(["2002-04", "2002-05", "2002-08", "2002-09"]);
    expect(monthsInDomain(layer, domain, "2022-06", "2022-09")).toEqual(["2022-06", "2022-07"]);
  });
});

describe("monthly records on the map pages", () => {
  // NASA's real list for MERRA-2's monthly air temperature (November 2026): stray single days with
  // gaps between them, though every month has a map.
  const STRAY = `<Domains><DimensionDomain><Domain>1980-01-01/2000-03-01/P1M,2000-03-03/2000-03-03/P1M,2000-03-04/2000-03-04/P1M,2025-06-04/2025-06-04/P1M,2025-07-01/2025-07-01/P1M,2025-09-01/2026-08-01/P1M</Domain></DimensionDomain></Domains>`;
  const merra = getLayer("MERRA2_2m_Air_Temperature_Assimilated_Monthly") as GibsLayer;
  const domain = parseDomainXml(STRAY)!;

  it("reads them month by month, whatever stray days NASA lists", () => {
    expect(resolveForLayer(merra, domain, "2025-08-15")).toEqual({ requested: "2025-08-15", date: "2025-08-01", resolution: "snapped" });
    expect(resolveForLayer(merra, domain, "2025-08-01").resolution).toBe("exact");
    expect(resolveForLayer(merra, domain, "2000-03-04").date).toBe("2000-03-01");
    // Plain day-by-day resolving would have jumped to July or September.
    expect(resolveInDomain(domain, "2025-08-15").date).not.toBe("2025-08-01");
  });

  it("stays within the record", () => {
    expect(resolveForLayer(merra, domain, "2027-02-10")).toMatchObject({ date: "2026-08-01", resolution: "latest" });
    expect(resolveForLayer(merra, domain, "1975-06-01")).toMatchObject({ date: "1980-01-01", resolution: "earliest" });
    expect(defaultDateFor(merra, domain)).toBe("2026-08-01");
  });

  it("asks for the date NASA lists in a month for uneven records, and the nearest one in a month with none", () => {
    const grace = getLayer("GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI") as GibsLayer;
    const record = clipDomain(parseDomainXml(GRACE), "2022-07")!;
    expect(resolveForLayer(grace, record, "2011-02-20").date).toBe("2011-02-08");
    expect(resolveForLayer(grace, record, "2017-08-10").date).not.toMatch(/^2017-08/);
    expect(resolveForLayer(grace, record, "2024-01-01")).toMatchObject({ date: "2022-07-01", resolution: "latest" });
  });

  it("leaves regular layers to the usual rules", () => {
    const ndvi = getLayer("MODIS_Terra_L3_NDVI_16Day") as GibsLayer;
    const sixteen = parseDomainXml(SIXTEEN)!;
    expect(resolveForLayer(ndvi, sixteen, "2026-01-20")).toEqual(resolveInDomain(sixteen, "2026-01-20"));
  });

  it("dates monthly and yearly maps the way people say them", () => {
    expect(formatLayerDate(merra, "2026-08-01")).toBe("Aug 2026");
    expect(formatLayerDate({ period: "yearly" }, "2024-01-01")).toBe("2024");
    expect(formatLayerDate({ period: "daily" }, "2026-11-04")).toBe("Nov 4, 2026");
    expect(provisionalDate(merra, "2025-03-17")).toBe("2025-03-01");
    expect(provisionalDate({ ...merra, period: "yearly" }, "2012-06-30")).toBe("2012-01-01");
  });
});

describe("waitsForDates", () => {
  it("lets daily maps draw their first guess, and makes monthly and yearly maps wait for NASA's dates", () => {
    expect(waitsForDates({ period: "daily" })).toBe(false);
    expect(waitsForDates({ period: "static" })).toBe(false);
    expect(waitsForDates({ period: "monthly" })).toBe(true);
    expect(waitsForDates({ period: "yearly" })).toBe(true);
    expect(waitsForDates({ period: "16-day" })).toBe(true);
  });
});
