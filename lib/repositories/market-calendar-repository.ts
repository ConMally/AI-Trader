import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getCurrentTradingSession,
  getNextMarketOpen,
  isMarketOpen,
  isTradingDay,
} from "@/lib/calendar/service";
import type { CalendarDay } from "@/lib/calendar/types";

// A window wide enough that getNextMarketOpen can always find the next
// open even across a long holiday weekend, without fetching the entire
// table on every call.
const WINDOW_DAYS_BACK = 2;
const WINDOW_DAYS_FORWARD = 14;

async function loadCalendarWindow(supabase: SupabaseClient<Database>, around: Date): Promise<CalendarDay[]> {
  const start = new Date(around);
  start.setUTCDate(start.getUTCDate() - WINDOW_DAYS_BACK);
  const end = new Date(around);
  end.setUTCDate(end.getUTCDate() + WINDOW_DAYS_FORWARD);

  const { data, error } = await supabase
    .from("market_calendar")
    .select("*")
    .gte("date", start.toISOString().slice(0, 10))
    .lte("date", end.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  if (error) throw new Error(`Failed to load market_calendar window: ${error.message}`);

  return data.map((row) => ({
    date: row.date,
    sessionType: row.session_type,
    marketOpen: row.market_open,
    marketClose: row.market_close,
  }));
}

/**
 * DB-backed convenience wrappers around lib/calendar/service.ts's pure
 * functions — fetch a window of market_calendar rows around `now` and
 * delegate. Every order-submission code path must call isMarketOpenNow
 * fresh immediately before calling the broker, never reuse a value
 * computed earlier in the request.
 */
export async function isMarketOpenNow(supabase: SupabaseClient<Database>, now: Date = new Date()): Promise<boolean> {
  const days = await loadCalendarWindow(supabase, now);
  return isMarketOpen(days, now);
}

export async function getCurrentTradingSessionNow(supabase: SupabaseClient<Database>, now: Date = new Date()) {
  const days = await loadCalendarWindow(supabase, now);
  return getCurrentTradingSession(days, now);
}

export async function getNextMarketOpenFromNow(supabase: SupabaseClient<Database>, now: Date = new Date()) {
  const days = await loadCalendarWindow(supabase, now);
  return getNextMarketOpen(days, now);
}

export async function isTradingDayOn(supabase: SupabaseClient<Database>, date: string): Promise<boolean> {
  const days = await loadCalendarWindow(supabase, new Date(`${date}T12:00:00Z`));
  return isTradingDay(days, date);
}
