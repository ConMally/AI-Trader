const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return currencyFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(fractionDigits)}%`;
}
