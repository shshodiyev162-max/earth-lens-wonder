// The arithmetic behind year timelines (components/common/YearTimeline.tsx).

/** Year labels under the track: the ends, and round years between that don't crowd them. */
export function timelineTicks(first: number, last: number): number[] {
  const span = last - first;
  const step = span > 30 ? 10 : span > 12 ? 5 : span > 5 ? 2 : 1;
  const between: number[] = [];
  for (let year = Math.ceil((first + 1) / step) * step; year < last; year += step) {
    if (year - first >= step / 2 + 1 && last - year >= step / 2 + 1) between.push(year);
  }
  return [first, ...between, last];
}

/** Keeps a span inside the track, in order, and at least `minYears` long. */
export function clampSpan([a, b]: [number, number], first: number, last: number, minYears = 1, moved: 0 | 1 = 1): [number, number] {
  const gap = Math.max(0, minYears - 1);
  let start = Math.max(first, Math.min(last, Math.round(a)));
  let end = Math.max(first, Math.min(last, Math.round(b)));
  if (end - start < gap) {
    // The handle being moved pushes against the other one, which stays where it was if it can.
    if (moved === 0) start = Math.max(first, end - gap);
    else end = Math.min(last, start + gap);
    if (end - start < gap) {
      if (moved === 0) end = Math.min(last, start + gap);
      else start = Math.max(first, end - gap);
    }
  }
  return [start, end];
}
