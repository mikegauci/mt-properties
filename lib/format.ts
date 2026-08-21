export function eur(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-MT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function compactNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-MT", { maximumFractionDigits: 0 }).format(value);
}

export function pct(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  const formatted = `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
  return formatted;
}

export function eurDelta(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  if (value > 0) return `+${eur(value)}`;
  if (value < 0) return `−${eur(Math.abs(value))}`;
  return eur(0);
}

export function typeLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ");
}

export function periodLabel(isoDate: string, periodType?: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (periodType === "year") return String(year);
  if (periodType === "quarter" || month % 3 === 0) {
    const quarter = Math.floor(month / 3) + 1;
    return `${year} Q${quarter}`;
  }
  return date.toLocaleDateString("en-MT", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}
