import "server-only";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ReadOnlyBrokerAdapter } from "@/lib/broker/types";
import type { MarketSessionType } from "@/types/database";
import { exchangeTimeToUtcIso } from "./timezone";

// A regular NYSE/NASDAQ session closes at 16:00 ET; anything earlier
// reported by the broker's calendar for a trading day is an early close
// (day-before-holiday half sessions, etc.).
const STANDARD_CLOSE_TIME = "16:00";

/**
 * Fetches the broker's calendar for `range` and upserts every date in that
 * range into market_calendar — including dates the broker's response
 * simply omits (weekends, holidays), which are recorded here as an
 * explicit 'closed' row rather than left absent. That distinction matters:
 * an absent row means "we haven't synced this date yet"; a 'closed' row
 * means "we know this date is not a trading day."
 *
 * Runs as the service role (bypasses RLS) since market_calendar is shared,
 * not per-user data — see supabase/functions/sync-market-calendar for the
 * scheduled entry point that calls the equivalent logic in production.
 * This function itself is what lib/calendar/sync.test.ts exercises, and is
 * also callable from a one-off local seed script.
 */
export async function syncMarketCalendar(broker: ReadOnlyBrokerAdapter, range: { start: string; end: string }): Promise<number> {
  const tradingDays = await broker.getCalendar(range);
  const byDate = new Map(tradingDays.map((day) => [day.date, day]));

  const allDates = eachDayOfInterval({ start: parseISO(range.start), end: parseISO(range.end) }).map((d) =>
    format(d, "yyyy-MM-dd")
  );

  const rows = allDates.map((date) => {
    const day = byDate.get(date);

    if (!day) {
      return {
        date,
        session_type: "closed" as MarketSessionType,
        market_open: null,
        market_close: null,
      };
    }

    const sessionType: MarketSessionType = day.closeTime < STANDARD_CLOSE_TIME ? "early_close" : "regular";

    return {
      date,
      session_type: sessionType,
      market_open: exchangeTimeToUtcIso(date, day.openTime),
      market_close: exchangeTimeToUtcIso(date, day.closeTime),
    };
  });

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("market_calendar").upsert(rows, { onConflict: "date" });
  if (error) throw new Error(`Failed to upsert market_calendar: ${error.message}`);

  return rows.length;
}
