import type { MarketSessionType } from "@/types/database";

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  sessionType: MarketSessionType;
  /** Absolute UTC instants — already converted from exchange-local time by
   * lib/calendar/sync.ts, so every consumer of this type can compare
   * against `new Date()` directly with no timezone/DST reasoning of its
   * own. Null when sessionType is 'closed'. */
  marketOpen: string | null;
  marketClose: string | null;
}

export type TradingSessionStatus = "open" | "closed";

export interface CurrentTradingSession {
  status: TradingSessionStatus;
  /** The calendar day this evaluation was made against (exchange date),
   * not necessarily the caller's local date. */
  date: string;
  marketOpen: string | null;
  marketClose: string | null;
}

export interface NextMarketOpen {
  date: string;
  marketOpen: string;
}
