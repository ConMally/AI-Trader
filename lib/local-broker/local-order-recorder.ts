import {
  DEFAULT_LOCAL_FILL_CONFIG,
  type FillModel,
  type LocalFillConfig,
  type LocalOrderRequest,
  type LocalOrderResult,
  type ReferenceQuote,
  type SimulationMetadata,
} from "./types";

const SIMULATION_ENGINE_VERSION = "local-sim-v1";

function computeEffectivePrice(
  side: "buy" | "sell",
  fillModel: FillModel,
  slippagePct: number,
  reference: ReferenceQuote
): { effectivePrice: number | null; slippageApplied: number } {
  const { bidPrice, askPrice } = reference;

  if (fillModel === "mid") {
    if (bidPrice === null || askPrice === null) return { effectivePrice: null, slippageApplied: 0 };
    return { effectivePrice: (bidPrice + askPrice) / 2, slippageApplied: 0 };
  }

  if (fillModel === "bid_ask_plus_slippage") {
    const base = side === "buy" ? askPrice : bidPrice;
    if (base === null) return { effectivePrice: null, slippageApplied: 0 };
    const slippageAmount = base * slippagePct;
    // Always worse for the trader: a buy pays more, a sell receives less.
    const effectivePrice = side === "buy" ? base + slippageAmount : base - slippageAmount;
    return { effectivePrice, slippageApplied: Math.abs(slippageAmount) };
  }

  // "bid_ask" — the default model.
  const base = side === "buy" ? askPrice : bidPrice;
  return { effectivePrice: base, slippageApplied: 0 };
}

/**
 * Records a simulated order entirely locally. No constructor dependency on
 * lib/broker/* (or any import of it), and no network call anywhere in this
 * class — every result is computed synchronously from the `reference`
 * quote the caller supplies. This is the ONLY place in the codebase order
 * placement happens; lib/order-executor/executor.ts's `recorder` parameter
 * is typed as this concrete class, not an interface anything Alpaca-backed
 * could also satisfy.
 */
export class LocalOnlyOrderRecorder {
  constructor(private readonly config: LocalFillConfig = DEFAULT_LOCAL_FILL_CONFIG) {}

  submitLocalOrder(request: LocalOrderRequest, reference: ReferenceQuote): LocalOrderResult {
    const submittedAt = new Date().toISOString();
    const localOrderId = `local-${crypto.randomUUID()}`;

    const { effectivePrice, slippageApplied } = computeEffectivePrice(
      request.side,
      this.config.fillModel,
      this.config.slippagePct,
      reference
    );

    const metadata: SimulationMetadata = {
      simulationMode: "local_simulation",
      fillModel: this.config.fillModel,
      referenceQuoteTimestamp: reference.sourceTimestamp,
      bidPriceUsed: reference.bidPrice,
      askPriceUsed: reference.askPrice,
      lastPriceUsed: reference.lastPrice,
      simulatedLatencyMs: this.config.simulatedLatencyMs,
      slippageApplied,
      simulationEngineVersion: SIMULATION_ENGINE_VERSION,
    };

    if (effectivePrice === null) {
      return {
        localOrderId,
        status: "rejected",
        filledQty: 0,
        filledAvgPrice: null,
        filledAt: null,
        submittedAt,
        simulation: true,
        metadata,
        rejectionReason: "No usable reference price (bid/ask unavailable) to simulate a fill against.",
      };
    }

    if (request.type === "market") {
      return {
        localOrderId,
        status: "filled",
        filledQty: request.qty,
        filledAvgPrice: effectivePrice,
        filledAt: submittedAt,
        submittedAt,
        simulation: true,
        metadata,
      };
    }

    // Limit order: fills immediately, AT THE LIMIT PRICE (standard
    // price-improvement semantics — never worse than what was requested),
    // only if the effective price has already crossed it. Otherwise it's
    // recorded as 'open' and stays that way — Phase 1 has no background
    // sweep to fill it later; that's an explicit non-goal, not an
    // oversight (see lib/local-broker/README.md).
    const limitPrice = request.limitPrice;
    if (limitPrice === undefined) {
      return {
        localOrderId,
        status: "rejected",
        filledQty: 0,
        filledAvgPrice: null,
        filledAt: null,
        submittedAt,
        simulation: true,
        metadata,
        rejectionReason: "Limit order submitted without a limit price.",
      };
    }

    const crossed = request.side === "buy" ? effectivePrice <= limitPrice : effectivePrice >= limitPrice;

    if (crossed) {
      return {
        localOrderId,
        status: "filled",
        filledQty: request.qty,
        filledAvgPrice: limitPrice,
        filledAt: submittedAt,
        submittedAt,
        simulation: true,
        metadata,
      };
    }

    return {
      localOrderId,
      status: "open",
      filledQty: 0,
      filledAvgPrice: null,
      filledAt: null,
      submittedAt,
      simulation: true,
      metadata,
    };
  }
}
