// Broker-agnostic, READ-ONLY domain types. Nothing in this file (or in any
// caller of ReadOnlyBrokerAdapter) may import an Alpaca-specific shape —
// those stay inside lib/broker/alpaca/ and are translated at the boundary
// by lib/broker/alpaca/mapper.ts.
//
// There is deliberately no order-submission method anywhere in this file.
// Order placement lives entirely in lib/local-broker/ (a local-only
// simulator, never a network call) — see lib/order-executor/executor.ts.
// This module cannot be used to place, cancel, or otherwise write an order
// to any brokerage, by construction, not by convention.

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";

export interface BrokerAccountSnapshot {
  brokerAccountId: string;
  status: string;
  currency: string;
  cash: number;
  equity: number;
  buyingPower: number;
  retrievedAt: string; // ISO timestamp of when this snapshot was fetched
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  marketValue: number | null;
  unrealizedPl: number | null;
}

/** Read-only view of an order the broker reports — used for displaying
 * Alpaca's own order history, never for placing one. */
export interface BrokerOrder {
  brokerOrderId: string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limitPrice: number | null;
  status: string;
  filledQty: number;
  filledAvgPrice: number | null;
  submittedAt: string;
  filledAt: string | null;
}

export interface BrokerQuote {
  symbol: string;
  bidPrice: number | null;
  askPrice: number | null;
  lastPrice: number | null;
  /** The quote's own timestamp as reported by the provider, not our clock. */
  sourceTimestamp: string;
  provider: string;
  feed: string;
}

export interface BrokerBar {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BrokerCalendarDay {
  date: string; // YYYY-MM-DD
  // Exchange-local (America/New_York) wall-clock times, "HH:MM", exactly as
  // reported by the broker's calendar endpoint. Deliberately NOT converted
  // to UTC here — that's calendar-domain knowledge (which timezone, DST
  // rules), not broker-domain knowledge, so lib/calendar/sync.ts does the
  // conversion when upserting market_calendar. Keeps lib/broker decoupled
  // from lib/calendar entirely.
  openTime: string;
  closeTime: string;
}

export interface GetBarsParams {
  start: string; // ISO date/timestamp
  end: string; // ISO date/timestamp
  timeframe: "1Min" | "5Min" | "15Min" | "1Hour" | "1Day";
}

export interface GetCalendarParams {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

/**
 * Broker-agnostic, READ-ONLY market-data + account-display interface.
 * `mode` is a literal 'paper' type on every implementation that exists in
 * this phase. There is no `submitOrder`, no `getOrderByClientOrderId`, no
 * write method of any kind here — see the module comment above for why.
 *
 * Only lib/account-sync/ and lib/market-data/ may import this module or
 * anything under lib/broker/alpaca/. lib/validator/, lib/order-executor/,
 * and lib/local-broker/ must never import from lib/broker/ at all — order
 * placement has no dependency on it whatsoever.
 */
export interface ReadOnlyBrokerAdapter {
  readonly mode: "paper";
  getAccount(): Promise<BrokerAccountSnapshot>;
  getPositions(): Promise<BrokerPosition[]>;
  getRecentOrders(params?: { limit?: number }): Promise<BrokerOrder[]>;
  getLatestQuote(symbol: string): Promise<BrokerQuote>;
  getBars(symbol: string, params: GetBarsParams): Promise<BrokerBar[]>;
  getCalendar(params: GetCalendarParams): Promise<BrokerCalendarDay[]>;
}
