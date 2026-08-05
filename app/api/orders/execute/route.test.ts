import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabaseClient, seed, type FakeSupabase } from "@/test/fake-supabase";

let fakeSupabase: FakeSupabase;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeSupabase,
}));

vi.mock("@/lib/broker", () => ({
  getPaperBrokerAdapter: () => ({
    mode: "paper",
    getLatestQuote: async () => ({
      symbol: "AAPL",
      bidPrice: 100,
      askPrice: 100.1,
      lastPrice: null,
      sourceTimestamp: new Date().toISOString(),
      provider: "alpaca",
      feed: "iex",
    }),
  }),
}));

vi.mock("@/lib/repositories/market-calendar-repository", () => ({
  isMarketOpenNow: async () => true,
}));

const { POST } = await import("./route");

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/orders/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedAccountAndRiskLimits(supabase: FakeSupabase, userId: string, accountId: string) {
  seed(supabase, "accounts", [
    { id: accountId, user_id: userId, mode: "paper", starting_balance: 1000, kill_switch_enabled: false },
  ]);
  seed(supabase, "risk_limits", [
    {
      id: "rl-1",
      account_id: accountId,
      risk_per_trade_pct: 0.005,
      max_position_pct: 0.2,
      max_daily_loss_pct: 0.03,
      max_concurrent_positions: 5,
      max_price_slippage_pct: 0.05,
      quote_staleness_seconds: 60,
    },
  ]);
}

function seedApprovedProposal(supabase: FakeSupabase, params: { id: string; userId: string; accountId: string; clientOrderId: string }) {
  seed(supabase, "proposals", [
    {
      id: params.id,
      user_id: params.userId,
      account_id: params.accountId,
      symbol: "AAPL",
      direction: "buy",
      qty: 5,
      entry_price: 100,
      order_type: "market",
      status: "approved",
      client_order_id: params.clientOrderId,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      source: "manual",
    },
  ]);
}

describe("POST /api/orders/execute", () => {
  beforeEach(() => {
    fakeSupabase = createFakeSupabaseClient("user-1");
  });

  it("returns 401 when there is no session", async () => {
    fakeSupabase = createFakeSupabaseClient(null);

    const res = await POST(makeRequest({ proposalId: "00000000-0000-0000-0000-000000000000", clientOrderId: "c1" }));

    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed body", async () => {
    seedAccountAndRiskLimits(fakeSupabase, "user-1", "acct-1");

    const res = await POST(makeRequest({ proposalId: "not-a-uuid" }));

    expect(res.status).toBe(400);
  });

  it("returns 403 when the proposal belongs to a different account", async () => {
    seedAccountAndRiskLimits(fakeSupabase, "user-1", "acct-1");
    seedApprovedProposal(fakeSupabase, { id: "11111111-1111-4111-8111-111111111111", userId: "someone-else", accountId: "other-account", clientOrderId: "c1" });

    const res = await POST(makeRequest({ proposalId: "11111111-1111-4111-8111-111111111111", clientOrderId: "c1" }));

    expect(res.status).toBe(403);
  });

  it("returns 400 when clientOrderId does not match the proposal's own", async () => {
    seedAccountAndRiskLimits(fakeSupabase, "user-1", "acct-1");
    seedApprovedProposal(fakeSupabase, { id: "22222222-2222-4222-8222-222222222222", userId: "user-1", accountId: "acct-1", clientOrderId: "the-real-one" });

    const res = await POST(makeRequest({ proposalId: "22222222-2222-4222-8222-222222222222", clientOrderId: "a-different-one" }));

    expect(res.status).toBe(400);
  });

  it("executes successfully for a valid, owned, approved proposal", async () => {
    seedAccountAndRiskLimits(fakeSupabase, "user-1", "acct-1");
    seedApprovedProposal(fakeSupabase, { id: "33333333-3333-4333-8333-333333333333", userId: "user-1", accountId: "acct-1", clientOrderId: "c1" });

    const res = await POST(makeRequest({ proposalId: "33333333-3333-4333-8333-333333333333", clientOrderId: "c1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("executed");
  });

  it("repeated execute calls for the same proposal result in exactly one execution", async () => {
    seedAccountAndRiskLimits(fakeSupabase, "user-1", "acct-1");
    seedApprovedProposal(fakeSupabase, { id: "44444444-4444-4444-8444-444444444444", userId: "user-1", accountId: "acct-1", clientOrderId: "c1" });

    const [first, second] = await Promise.all([
      POST(makeRequest({ proposalId: "44444444-4444-4444-8444-444444444444", clientOrderId: "c1" })),
      POST(makeRequest({ proposalId: "44444444-4444-4444-8444-444444444444", clientOrderId: "c1" })),
    ]);
    const [firstBody, secondBody] = await Promise.all([first.json(), second.json()]);

    const statuses = [firstBody.data?.status, secondBody.data?.status].sort();
    // Exactly one call actually executes; the other finds the proposal
    // already past 'approved' and reports already_handled.
    expect(statuses).toEqual(["already_handled", "executed"]);

    const orders = fakeSupabase.__store.get("orders") ?? [];
    expect(orders).toHaveLength(1);
  });
});
