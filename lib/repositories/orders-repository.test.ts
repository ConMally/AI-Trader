import { describe, expect, it, vi } from "vitest";
import { recordLocalOrder } from "./orders-repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { LocalOrderResult } from "@/lib/local-broker/types";

function filledResult(overrides: Partial<LocalOrderResult> = {}): LocalOrderResult {
  return {
    localOrderId: "local-abc",
    status: "filled",
    filledQty: 10,
    filledAvgPrice: 100.1,
    filledAt: "2024-06-01T14:30:00.000Z",
    submittedAt: "2024-06-01T14:30:00.000Z",
    simulation: true,
    metadata: {
      simulationMode: "local_simulation",
      fillModel: "bid_ask",
      referenceQuoteTimestamp: "2024-06-01T14:29:59.000Z",
      bidPriceUsed: 100,
      askPriceUsed: 100.1,
      lastPriceUsed: null,
      simulatedLatencyMs: 0,
      slippageApplied: 0,
      simulationEngineVersion: "local-sim-v1",
    },
    ...overrides,
  };
}

describe("recordLocalOrder", () => {
  it("marks the row is_simulated=true and stores the full simulation metadata", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as SupabaseClient<Database>;

    await recordLocalOrder(supabase, {
      userId: "u1",
      accountId: "a1",
      proposalId: "p1",
      clientOrderId: "c1",
      result: filledResult(),
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        is_simulated: true,
        broker_order_id: "local-abc",
        status: "filled",
        filled_qty: 10,
        simulation_metadata: expect.objectContaining({ simulationMode: "local_simulation" }),
      })
    );
  });

  it("maps an 'open' local status to the 'accepted' order status", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as SupabaseClient<Database>;

    await recordLocalOrder(supabase, {
      userId: "u1",
      accountId: "a1",
      proposalId: "p1",
      clientOrderId: "c1",
      result: filledResult({ status: "open", filledQty: 0, filledAvgPrice: null, filledAt: null }),
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ status: "accepted" }));
  });

  it("maps a 'rejected' local status to the 'rejected' order status", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as SupabaseClient<Database>;

    await recordLocalOrder(supabase, {
      userId: "u1",
      accountId: "a1",
      proposalId: "p1",
      clientOrderId: "c1",
      result: filledResult({ status: "rejected", filledQty: 0, filledAvgPrice: null, filledAt: null, rejectionReason: "no quote" }),
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
  });
});
