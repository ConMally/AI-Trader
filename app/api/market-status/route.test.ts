import { describe, expect, it, vi, beforeEach } from "vitest";
import { createFakeSupabaseClient, seed, type FakeSupabase } from "@/test/fake-supabase";
import { BrokerConfigError } from "@/lib/broker/errors";

let fakeSupabase: FakeSupabase;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeSupabase,
}));

const isMarketOpenNow = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/repositories/market-calendar-repository", () => ({
  isMarketOpenNow: (...args: unknown[]) => isMarketOpenNow(...args),
  getCurrentTradingSessionNow: async () => ({ status: "open", date: "2024-06-01", marketOpen: null, marketClose: null }),
  getNextMarketOpenFromNow: async () => null,
}));

const { GET } = await import("./route");

// The in-memory rate-limit bucket is keyed by userId and shared across the
// whole test file (it's a module-level Map, not reset per test) — each
// test uses its own unique user id so their request counts can't bleed
// into one another.
function setUp(userId: string) {
  fakeSupabase = createFakeSupabaseClient(userId);
  seed(fakeSupabase, "accounts", [
    { id: `acct-${userId}`, user_id: userId, mode: "paper", starting_balance: 1000, kill_switch_enabled: false },
  ]);
}

describe("GET /api/market-status", () => {
  beforeEach(() => {
    isMarketOpenNow.mockReset().mockResolvedValue(true);
    vi.stubEnv("NODE_ENV", "test");
  });

  it("returns 401 without a session", async () => {
    fakeSupabase = createFakeSupabaseClient(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns market status for an authenticated request", async () => {
    setUp("user-status-1");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.open).toBe(true);
  });

  it("blocks with 429 once the read rate limit is exceeded", async () => {
    setUp("user-status-2");

    let last;
    for (let i = 0; i < 60; i++) {
      last = await GET();
    }
    expect(last!.status).toBe(200);

    const blocked = await GET();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("maps a config error from a dependency to a safe response, not a crash", async () => {
    setUp("user-status-3");
    // Simulate an unexpected dependency failure (analogous to Alpaca being
    // unreachable) — respond.ts must turn this into a safe 503, never an
    // unhandled crash, and must never leak internal detail.
    isMarketOpenNow.mockRejectedValueOnce(new BrokerConfigError("Missing ALPACA_PAPER_API_KEY_ID"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain("ALPACA_PAPER_API_KEY_ID");
    expect(body.error).not.toMatch(/secret|password/i);
  });
});
