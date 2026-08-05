import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalOnlyOrderRecorder, previewFill } from "./local-order-recorder";
import type { ReferenceQuote } from "./types";

const REFERENCE: ReferenceQuote = {
  bidPrice: 100,
  askPrice: 100.1,
  lastPrice: 100.05,
  sourceTimestamp: "2024-06-01T14:30:00.000Z",
};

describe("LocalOnlyOrderRecorder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never calls fetch — this class makes no network call of any kind", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    new LocalOnlyOrderRecorder().submitLocalOrder(
      { clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "market", qty: 1 },
      REFERENCE
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("produces a local-<uuid> id and marks every result as a simulation", () => {
    const result = new LocalOnlyOrderRecorder().submitLocalOrder(
      { clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "market", qty: 1 },
      REFERENCE
    );

    expect(result.localOrderId).toMatch(/^local-[0-9a-f-]{36}$/);
    expect(result.simulation).toBe(true);
    expect(result.metadata.simulationMode).toBe("local_simulation");
    expect(result.metadata.simulationEngineVersion).toBe("local-sim-v1");
  });

  describe("bid_ask model (default)", () => {
    it("fills a market buy at the ask", () => {
      const result = new LocalOnlyOrderRecorder().submitLocalOrder(
        { clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "market", qty: 10 },
        REFERENCE
      );
      expect(result.status).toBe("filled");
      expect(result.filledAvgPrice).toBe(100.1);
      expect(result.filledQty).toBe(10);
      expect(result.metadata.slippageApplied).toBe(0);
    });

    it("fills a market sell at the bid", () => {
      const result = new LocalOnlyOrderRecorder().submitLocalOrder(
        { clientOrderId: "c1", symbol: "AAPL", side: "sell", type: "market", qty: 10 },
        REFERENCE
      );
      expect(result.filledAvgPrice).toBe(100);
    });

    it("fills a limit buy at the limit price when the ask has crossed it", () => {
      const result = new LocalOnlyOrderRecorder().submitLocalOrder(
        { clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "limit", qty: 1, limitPrice: 101 },
        REFERENCE // ask 100.1 <= limit 101
      );
      expect(result.status).toBe("filled");
      expect(result.filledAvgPrice).toBe(101);
    });

    it("leaves a limit buy open when the ask has not crossed it", () => {
      const result = new LocalOnlyOrderRecorder().submitLocalOrder(
        { clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "limit", qty: 1, limitPrice: 99 },
        REFERENCE // ask 100.1 > limit 99
      );
      expect(result.status).toBe("open");
      expect(result.filledQty).toBe(0);
      expect(result.filledAvgPrice).toBeNull();
    });

    it("leaves a limit sell open when the bid has not crossed it", () => {
      const result = new LocalOnlyOrderRecorder().submitLocalOrder(
        { clientOrderId: "c1", symbol: "AAPL", side: "sell", type: "limit", qty: 1, limitPrice: 105 },
        REFERENCE // bid 100 < limit 105
      );
      expect(result.status).toBe("open");
    });
  });

  describe("mid model", () => {
    it("fills a market order at the midpoint regardless of side", () => {
      const recorder = new LocalOnlyOrderRecorder({ fillModel: "mid", slippagePct: 0, simulatedLatencyMs: 0 });
      const buy = recorder.submitLocalOrder({ clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "market", qty: 1 }, REFERENCE);
      const sell = recorder.submitLocalOrder({ clientOrderId: "c2", symbol: "AAPL", side: "sell", type: "market", qty: 1 }, REFERENCE);
      expect(buy.filledAvgPrice).toBe(100.05);
      expect(sell.filledAvgPrice).toBe(100.05);
    });
  });

  describe("bid_ask_plus_slippage model", () => {
    it("fills a buy worse than the ask by the configured slippage", () => {
      const recorder = new LocalOnlyOrderRecorder({ fillModel: "bid_ask_plus_slippage", slippagePct: 0.01, simulatedLatencyMs: 0 });
      const result = recorder.submitLocalOrder({ clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "market", qty: 1 }, REFERENCE);
      // ask 100.1 * 1.01 = 101.101
      expect(result.filledAvgPrice).toBeCloseTo(101.101, 5);
      expect(result.metadata.slippageApplied).toBeCloseTo(1.001, 5);
    });

    it("fills a sell worse than the bid by the configured slippage", () => {
      const recorder = new LocalOnlyOrderRecorder({ fillModel: "bid_ask_plus_slippage", slippagePct: 0.01, simulatedLatencyMs: 0 });
      const result = recorder.submitLocalOrder({ clientOrderId: "c1", symbol: "AAPL", side: "sell", type: "market", qty: 1 }, REFERENCE);
      // bid 100 * 0.99 = 99
      expect(result.filledAvgPrice).toBeCloseTo(99, 5);
      expect(result.metadata.slippageApplied).toBeCloseTo(1, 5);
    });
  });

  it("rejects when no usable reference price exists", () => {
    const result = new LocalOnlyOrderRecorder().submitLocalOrder(
      { clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "market", qty: 1 },
      { bidPrice: null, askPrice: null, lastPrice: null, sourceTimestamp: "2024-06-01T14:30:00.000Z" }
    );
    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBeDefined();
  });

  it("rejects a limit order submitted without a limit price", () => {
    const result = new LocalOnlyOrderRecorder().submitLocalOrder(
      { clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "limit", qty: 1 },
      REFERENCE
    );
    expect(result.status).toBe("rejected");
  });

  it("submitLocalOrder is provably the same calculation as previewFill (delegates, not a parallel copy)", () => {
    const request = { clientOrderId: "c1", symbol: "AAPL", side: "buy" as const, type: "market" as const, qty: 5 };
    const preview = previewFill(request, REFERENCE);
    const submitted = new LocalOnlyOrderRecorder().submitLocalOrder(request, REFERENCE);

    // localOrderId/timestamps differ (fresh each call) — everything else must match exactly.
    expect(submitted.status).toBe(preview.status);
    expect(submitted.filledAvgPrice).toBe(preview.filledAvgPrice);
    expect(submitted.filledQty).toBe(preview.filledQty);
    expect(submitted.metadata).toEqual(preview.metadata);
  });

  it("records full simulation metadata on every result", () => {
    const recorder = new LocalOnlyOrderRecorder({ fillModel: "mid", slippagePct: 0, simulatedLatencyMs: 250 });
    const result = recorder.submitLocalOrder(
      { clientOrderId: "c1", symbol: "AAPL", side: "buy", type: "market", qty: 1 },
      REFERENCE
    );
    expect(result.metadata).toEqual({
      simulationMode: "local_simulation",
      fillModel: "mid",
      referenceQuoteTimestamp: REFERENCE.sourceTimestamp,
      bidPriceUsed: REFERENCE.bidPrice,
      askPriceUsed: REFERENCE.askPrice,
      lastPriceUsed: REFERENCE.lastPrice,
      simulatedLatencyMs: 250,
      slippageApplied: 0,
      simulationEngineVersion: "local-sim-v1",
    });
  });
});
