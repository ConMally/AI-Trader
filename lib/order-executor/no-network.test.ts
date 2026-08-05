// Proves that the REAL confirm -> execute order lifecycle (not mocked
// repositories, not a mocked LocalOnlyOrderRecorder) never issues a single
// network request. A minimal in-memory fake stands in for Supabase (see
// test/fake-supabase.ts, so no real DB round-trip is needed either) —
// global `fetch` is stubbed to throw immediately on any call, so any
// accidental network access anywhere in the real code path fails this test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmManualOrder } from "./confirm";
import { executeProposal } from "./executor";
import { LocalOnlyOrderRecorder } from "@/lib/local-broker/local-order-recorder";
import { createFakeSupabaseClient } from "@/test/fake-supabase";

describe("full order lifecycle — zero network requests", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(() => {
      throw new Error("Network access attempted during local-simulation-only order flow");
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirmManualOrder -> executeProposal never calls fetch, using the real implementations", async () => {
    const supabase = createFakeSupabaseClient();

    const proposal = await confirmManualOrder(supabase as never, {
      user_id: "u1",
      account_id: "a1",
      symbol: "AAPL",
      direction: "buy",
      qty: 10,
      entry_price: 100,
      order_type: "market",
      client_order_id: "no-network-test-1",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const outcome = await executeProposal({
      supabase: supabase as never,
      recorder: new LocalOnlyOrderRecorder(),
      proposalId: proposal.id,
      quote: {
        bidPrice: 100,
        askPrice: 100.1,
        lastPrice: null,
        sourceTimestamp: new Date().toISOString(),
        validation: { status: "ok" },
      },
      marketOpen: true,
      maxSlippagePct: 0.005,
    });

    expect(outcome.status).toBe("executed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
