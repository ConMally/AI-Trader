// Alpaca wire-format JSON <-> internal domain types (lib/broker/types.ts).
// Alpaca returns numeric fields as strings — every numeric field is parsed
// here, once, so nothing downstream has to remember that quirk. Nothing in
// this file is imported outside lib/broker/alpaca/.

import type {
  BrokerAccountSnapshot,
  BrokerBar,
  BrokerCalendarDay,
  BrokerOrder,
  BrokerPosition,
  BrokerQuote,
  OrderSide,
  OrderType,
} from "../types";

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  return typeof value === "number" ? value : Number.parseFloat(value);
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = toNumber(value);
  return Number.isNaN(n) ? null : n;
}

export interface AlpacaAccountWire {
  id: string;
  status: string;
  currency: string;
  cash: string;
  equity: string;
  buying_power: string;
}

export function mapAccount(wire: AlpacaAccountWire): BrokerAccountSnapshot {
  return {
    brokerAccountId: wire.id,
    status: wire.status,
    currency: wire.currency,
    cash: toNumber(wire.cash),
    equity: toNumber(wire.equity),
    buyingPower: toNumber(wire.buying_power),
    retrievedAt: new Date().toISOString(),
  };
}

export interface AlpacaPositionWire {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  market_value: string | null;
  unrealized_pl: string | null;
  side: "long" | "short";
}

export function mapPosition(wire: AlpacaPositionWire): BrokerPosition {
  const qty = toNumber(wire.qty);
  return {
    symbol: wire.symbol,
    // Alpaca reports qty as an unsigned magnitude with a separate `side`;
    // Phase 1 is long-only, so a negative (short) qty here would indicate
    // something happened outside this app's own guardrails — surfaced as a
    // negative number rather than silently coerced, so account-sync can
    // flag it instead of hiding it.
    qty: wire.side === "short" ? -qty : qty,
    avgEntryPrice: toNumber(wire.avg_entry_price),
    marketValue: toNullableNumber(wire.market_value),
    unrealizedPl: toNullableNumber(wire.unrealized_pl),
  };
}

export interface AlpacaOrderWire {
  id: string;
  client_order_id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: string;
  limit_price: string | null;
  status: string;
  filled_qty: string;
  filled_avg_price: string | null;
  submitted_at: string;
  filled_at: string | null;
}

export function mapOrder(wire: AlpacaOrderWire): BrokerOrder {
  return {
    brokerOrderId: wire.id,
    clientOrderId: wire.client_order_id,
    symbol: wire.symbol,
    side: wire.side,
    type: wire.type,
    qty: toNumber(wire.qty),
    limitPrice: toNullableNumber(wire.limit_price),
    status: wire.status,
    filledQty: toNumber(wire.filled_qty),
    filledAvgPrice: toNullableNumber(wire.filled_avg_price),
    submittedAt: wire.submitted_at,
    filledAt: wire.filled_at,
  };
}

export interface AlpacaQuoteWire {
  symbol: string;
  quote: {
    t: string;
    ap: number;
    bp: number;
  } | null;
}

export function mapQuote(wire: AlpacaQuoteWire, feed: string): BrokerQuote {
  return {
    symbol: wire.symbol,
    bidPrice: wire.quote ? wire.quote.bp : null,
    askPrice: wire.quote ? wire.quote.ap : null,
    lastPrice: null, // Alpaca's latest-quote endpoint doesn't include a trade price; use bars/trades for that if ever needed.
    sourceTimestamp: wire.quote?.t ?? new Date(0).toISOString(),
    provider: "alpaca",
    feed,
  };
}

export interface AlpacaBarWire {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export function mapBar(symbol: string, wire: AlpacaBarWire): BrokerBar {
  return {
    symbol,
    timestamp: wire.t,
    open: wire.o,
    high: wire.h,
    low: wire.l,
    close: wire.c,
    volume: wire.v,
  };
}

export interface AlpacaCalendarDayWire {
  date: string;
  open: string;
  close: string;
}

export function mapCalendarDay(wire: AlpacaCalendarDayWire): BrokerCalendarDay {
  return {
    date: wire.date,
    openTime: wire.open,
    closeTime: wire.close,
  };
}
