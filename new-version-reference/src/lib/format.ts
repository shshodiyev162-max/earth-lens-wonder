export function formatNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatValue(value: number | null | undefined, unit?: string, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const number = formatNumber(value, decimals);
  if (!unit) return number;
  if (unit === "NDVI" || unit === "AOD") return number;
  if (unit === "%") return `${number}%`;
  return `${number} ${unit}`;
}
