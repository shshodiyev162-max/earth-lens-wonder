import { addMonthsToMonth, monthRange } from "../gibs/time";

export const EARLIEST_MONTH = "2000-03";
export const MAX_MONTHS = 120;

export const PERIOD_OPTIONS = [
  { id: "12", label: "12 months", months: 12 },
  { id: "24", label: "2 years", months: 24 },
  { id: "60", label: "5 years", months: 60 },
  { id: "custom", label: "Custom", months: 0 },
] as const;

export type PeriodId = (typeof PERIOD_OPTIONS)[number]["id"];

/** Last complete month that NASA's monthly products normally cover. */
export function defaultEndMonth(now = new Date()): string {
  const date = new Date(now.getTime() - 33 * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodRange(period: PeriodId, customStart: string | null, customEnd: string | null, latest = defaultEndMonth()): { start: string; end: string } {
  if (period === "custom" && customStart && customEnd) {
    let start = customStart < EARLIEST_MONTH ? EARLIEST_MONTH : customStart;
    let end = customEnd > latest ? latest : customEnd;
    if (start > end) [start, end] = [end, start];
    const span = monthRange(start, end).length;
    if (span > MAX_MONTHS) start = addMonthsToMonth(end, -(MAX_MONTHS - 1));
    return { start, end };
  }
  const option = PERIOD_OPTIONS.find((o) => o.id === period && o.months) ?? PERIOD_OPTIONS[0];
  return { start: addMonthsToMonth(latest, -(option.months - 1)), end: latest };
}
