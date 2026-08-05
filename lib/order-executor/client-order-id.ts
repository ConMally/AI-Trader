// A prefix makes these identifiable as ours in Alpaca's own dashboard/logs,
// distinct from any order placed some other way. crypto.randomUUID() is
// available in both the Next.js server runtime and Node >=18.18 (this
// project's minimum, see package.json engines).
export function generateClientOrderId(): string {
  return `aitrader-manual-${crypto.randomUUID()}`;
}
