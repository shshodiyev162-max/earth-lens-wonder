/**
 * Where to label a chart of a long record: at the start of evenly spaced years, counted back from
 * the newest so the latest year always has a label. Without this the labels land on whichever
 * months happen to fit ("Jul '09, Apr '12, Feb '15"), which reads as noise.
 */
export function yearTicks(months: string[], most = 7): string[] {
  const starts = months.filter((month, i) => i === 0 || month.slice(0, 4) !== months[i - 1].slice(0, 4));
  if (starts.length < 2) return starts;

  // A record that begins late in a year would put two year labels almost on top of each other.
  const inFirstYear = months.indexOf(starts[1]);
  const inSecondYear = (starts[2] ? months.indexOf(starts[2]) : months.length) - inFirstYear;
  const whole = inFirstYear < inSecondYear ? starts.slice(1) : starts;

  const step = Math.max(1, Math.ceil(whole.length / most));
  return whole.filter((_, i) => (whole.length - 1 - i) % step === 0);
}
