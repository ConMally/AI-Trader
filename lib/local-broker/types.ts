// Order placement lives entirely in this module. It has NO dependency on
// lib/broker/ — no import of it anywhere in this directory — and makes no
// network call of any kind. Every "order" here is a local record only;
// nothing is ever transmitted to Alpaca or any other brokerage.

export type FillModel = "mid" | "bid_ask" | "bid_ask_plus_slippage";

export interface LocalFillConfig {
  fillModel: FillModel;
  /** Only consulted by 'bid_ask_plus_slippage'; ignored by every other
   * model. Expressed as a fraction (e.g. 0.001 = 0.1%). */
  slippagePct: number;
  /** Recorded in SimulationMetadata only — Phase 1 fills are synchronous
   * and deterministic; this never actually delays execution or a test. */
  simulatedLatencyMs: number;
}

export const DEFAULT_LOCAL_FILL_CONFIG: LocalFillConfig = {
  fillModel: "bid_ask",
  slippagePct: 0,
  simulatedLatencyMs: 0,
};

export type LocalOrderSide = "buy" | "sell";
export type LocalOrderType = "market" | "limit";

export interface LocalOrderRequest {
  clientOrderId: string;
  symbol: string;
  side: LocalOrderSide;
  type: LocalOrderType;
  qty: number;
  /** Required when type === 'limit', ignored otherwise. */
  limitPrice?: number;
}

/** An already-fetched, already-validated quote — plain numbers, not a
 * broker object. This is what keeps this module free of any lib/broker/
 * dependency. */
export interface ReferenceQuote {
  bidPrice: number | null;
  askPrice: number | null;
  lastPrice: number | null;
  sourceTimestamp: string;
}

export interface SimulationMetadata {
  simulationMode: "local_simulation";
  fillModel: FillModel;
  referenceQuoteTimestamp: string;
  bidPriceUsed: number | null;
  askPriceUsed: number | null;
  lastPriceUsed: number | null;
  simulatedLatencyMs: number;
  /** Absolute per-share price delta the slippage model added; 0 for every
   * other model. */
  slippageApplied: number;
  simulationEngineVersion: string;
}

export type LocalOrderStatus = "filled" | "open" | "rejected";

export interface LocalOrderResult {
  localOrderId: string; // "local-<uuid>"
  status: LocalOrderStatus;
  filledQty: number;
  filledAvgPrice: number | null;
  filledAt: string | null;
  submittedAt: string;
  /** Literal `true` — every consumer can tell at a glance, without string-
   * sniffing `localOrderId`, that this was never sent to a brokerage. */
  readonly simulation: true;
  metadata: SimulationMetadata;
  /** Present only when status === 'rejected' (e.g. no usable reference
   * price at all). */
  rejectionReason?: string;
}
