import { describe, expect, it, vi, beforeEach } from "vitest";

const insertSnapshot = vi.fn();
const listPositions = vi.fn();
const upsertPosition = vi.fn();
const zeroOutPosition = vi.fn();
const logEventSafely = vi.fn();

vi.mock("@/lib/repositories/broker-account-snapshots-repository", () => ({
  insertSnapshot: (...args: unknown[]) => insertSnapshot(...args),
}));
vi.mock("@/lib/repositories/positions-repository", () => ({
  listPositions: (...args: unknown[]) => listPositions(...args),
  upsertPosition: (...args: unknown[]) => upsertPosition(...args),
  zeroOutPosition: (...args: unknown[]) => zeroOutPosition(...args),
}));
vi.mock("@/lib/repositories/audit-log-repository", () => ({
  logEventSafely: (...args: unknown[]) => logEventSafely(...args),
}));

const { syncAccountSnapshot, syncPositions, getRecentBrokerOrders, syncAccount } = await import("./sync");

const FAKE_SUPABASE = {} as never;

function fakeBroker(overrides: Record<string, unknown> = {}) {
  return {
    mode: "paper",
    getAccount: vi.fn().mockResolvedValue({ brokerAccountId: "b1", status: "ACTIVE", currency: "USD", cash: 900, equity: 1000, buyingPower: 900, retrievedAt: "2024-01-01T00:00:00.000Z" }),
    getPositions: vi.fn().mockResolvedValue([]),
    getRecentOrders: vi.fn().mockResolvedValue([]),
    getLatestQuote: vi.fn(),
    getBars: vi.fn(),
    getCalendar: vi.fn(),
    ...overrides,
  } as never;
}

describe("syncAccountSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches via getAccount only (read-only) and persists the snapshot", async () => {
    const broker = fakeBroker();
    await syncAccountSnapshot({ supabase: FAKE_SUPABASE, broker, userId: "u1", accountId: "a1" });

    expect(insertSnapshot).toHaveBeenCalledWith(FAKE_SUPABASE, expect.objectContaining({ userId: "u1", accountId: "a1" }));
    expect(logEventSafely).toHaveBeenCalledWith(FAKE_SUPABASE, expect.objectContaining({ eventType: "account_synced" }));
  });

  it("logs a failure event (best-effort) and rethrows when the broker call fails", async () => {
    const broker = fakeBroker({ getAccount: vi.fn().mockRejectedValue(new Error("alpaca down")) });

    await expect(syncAccountSnapshot({ supabase: FAKE_SUPABASE, broker, userId: "u1", accountId: "a1" })).rejects.toThrow("alpaca down");
    expect(logEventSafely).toHaveBeenCalledWith(FAKE_SUPABASE, expect.objectContaining({ eventType: "account_sync_failed" }));
    expect(insertSnapshot).not.toHaveBeenCalled();
  });
});

describe("syncPositions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts every broker-reported position", async () => {
    const broker = fakeBroker({
      getPositions: vi.fn().mockResolvedValue([{ symbol: "AAPL", qty: 5, avgEntryPrice: 100, marketValue: 500, unrealizedPl: 0 }]),
    });
    listPositions.mockResolvedValue([]);

    await syncPositions({ supabase: FAKE_SUPABASE, broker, userId: "u1", accountId: "a1" });

    expect(upsertPosition).toHaveBeenCalledWith(FAKE_SUPABASE, expect.objectContaining({ userId: "u1", accountId: "a1" }));
    expect(zeroOutPosition).not.toHaveBeenCalled();
  });

  it("zeroes out a previously-synced symbol the broker no longer reports", async () => {
    const broker = fakeBroker({ getPositions: vi.fn().mockResolvedValue([]) });
    listPositions.mockResolvedValue([{ symbol: "MSFT", qty: 3 }]);

    await syncPositions({ supabase: FAKE_SUPABASE, broker, userId: "u1", accountId: "a1" });

    expect(zeroOutPosition).toHaveBeenCalledWith(FAKE_SUPABASE, "a1", "MSFT");
  });

  it("does not re-zero a symbol that is already zero", async () => {
    const broker = fakeBroker({ getPositions: vi.fn().mockResolvedValue([]) });
    listPositions.mockResolvedValue([{ symbol: "MSFT", qty: 0 }]);

    await syncPositions({ supabase: FAKE_SUPABASE, broker, userId: "u1", accountId: "a1" });

    expect(zeroOutPosition).not.toHaveBeenCalled();
  });
});

describe("getRecentBrokerOrders", () => {
  it("passes through to broker.getRecentOrders without persisting anything", async () => {
    const broker = fakeBroker({ getRecentOrders: vi.fn().mockResolvedValue([{ brokerOrderId: "x" }]) });

    const orders = await getRecentBrokerOrders(broker, { limit: 10 });

    expect(orders).toEqual([{ brokerOrderId: "x" }]);
    expect(insertSnapshot).not.toHaveBeenCalled();
  });
});

describe("syncAccount", () => {
  it("orchestrates snapshot + positions together", async () => {
    const broker = fakeBroker();
    listPositions.mockResolvedValue([]);

    const result = await syncAccount({ supabase: FAKE_SUPABASE, broker, userId: "u1", accountId: "a1" });

    expect(result.snapshot).toBeDefined();
    expect(result.positions).toBeDefined();
  });
});
