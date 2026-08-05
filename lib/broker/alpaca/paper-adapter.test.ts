import { describe, expect, it, vi } from "vitest";
import { AlpacaPaperAdapter } from "./paper-adapter";
import type { ReadOnlyAlpacaClient } from "./client";

function fakeClient(overrides: Partial<ReadOnlyAlpacaClient> = {}): ReadOnlyAlpacaClient {
  return {
    get: vi.fn(),
    ...overrides,
  } as unknown as ReadOnlyAlpacaClient;
}

describe("AlpacaPaperAdapter", () => {
  it("mode is the literal 'paper'", () => {
    const adapter = new AlpacaPaperAdapter(fakeClient());
    expect(adapter.mode).toBe("paper");
  });

  it("has no submitOrder or getOrderByClientOrderId method — order placement cannot happen through this class", () => {
    const adapter = new AlpacaPaperAdapter(fakeClient()) as unknown as Record<string, unknown>;
    expect(adapter.submitOrder).toBeUndefined();
    expect(adapter.getOrderByClientOrderId).toBeUndefined();
    expect(AlpacaPaperAdapter.prototype).not.toHaveProperty("submitOrder");
    expect(AlpacaPaperAdapter.prototype).not.toHaveProperty("getOrderByClientOrderId");
  });

  it("getRecentOrders is read-only display of the broker's own order history", async () => {
    const client = fakeClient({
      get: vi.fn().mockResolvedValue([
        {
          id: "b1",
          client_order_id: "c1",
          symbol: "AAPL",
          side: "buy",
          type: "market",
          qty: "1",
          limit_price: null,
          status: "filled",
          filled_qty: "1",
          filled_avg_price: "150.00",
          submitted_at: "2024-01-01T00:00:00Z",
          filled_at: "2024-01-01T00:00:01Z",
        },
      ]),
    });
    const adapter = new AlpacaPaperAdapter(client);

    const orders = await adapter.getRecentOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].symbol).toBe("AAPL");
  });
});
