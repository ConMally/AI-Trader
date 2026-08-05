import { fromZonedTime } from "date-fns-tz";

// The one place this codebase names the exchange timezone. NYSE/NASDAQ
// both operate on America/New_York — using the IANA zone name (not a fixed
// UTC offset) is what makes daylight saving time transitions correct
// automatically; date-fns-tz resolves the right offset for any given date
// rather than us hand-tracking DST rules.
export const EXCHANGE_TIMEZONE = "America/New_York";

/**
 * Converts an exchange-local wall-clock time (as reported by a broker's
 * calendar endpoint, e.g. Alpaca's "date": "2024-11-29", "open": "09:30")
 * into an absolute UTC ISO timestamp. Correct across DST transitions
 * because `fromZonedTime` looks up the real IANA offset for that specific
 * date rather than assuming a fixed UTC-4/UTC-5.
 */
export function exchangeTimeToUtcIso(date: string, time: string): string {
  const naiveLocalDateTime = `${date}T${time}:00`;
  return fromZonedTime(naiveLocalDateTime, EXCHANGE_TIMEZONE).toISOString();
}
