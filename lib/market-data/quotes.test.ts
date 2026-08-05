import { describe, expect, it, vi } from "vitest";
import { getQuote, validateQuote } from "./quotes";
import type { ReadOnlyBrokerAdapter, BrokerQuote } from "@/lib/broker/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function baseQuote(overrides: Partial<BrokerQuote> = {}): BrokerQuote {
  return {
    symbol: "AAPL",
    bidPrice: 100,
    askPrice: 100.05,
    lastPrice: null,
    sourceTimestamp: new Date().toISOString(),
    provider: "alpaca",
    feed: "iex",
    ...overrides,
  };
}

describe("validateQuote", () => {
  const now = new Date("2024-06-01T14:30:00.000Z");

  it("accepts a fresh, well-formed quote", () => {
    const quote = baseQuote({ sourceTimestamp: new Date(now.getTime() - 1000).toISOString() });
    expect(validateQuote(quote, { stalenessSeconds: 60, now }).status).toBe("ok");
  });

  it("rejects a quote missing bid or ask", () => {
    const quote = baseQuote({ bidPrice: null });
    expect(validateQuote(quote, { stalenessSeconds: 60, now }).status).toBe("missing");
  });

  it("rejects a malformed (non-positive) price", () => {
    const quote = baseQuote({ bidPrice: -5 });
    expect(validateQuote(quote, { stalenessSeconds: 60, now }).status).toBe("malformed");
  });

  it("rejects a crossed quote (bid > ask)", () => {
    const quote = baseQuote({ bidPrice: 105, askPrice: 100 });
    expect(validateQuote(quote, { stalenessSeconds: 60, now }).status).toBe("crossed");
  });

  it("rejects a future-dated quote beyond tolerance", () => {
    const quote = baseQuote({ sourceTimestamp: new Date(now.getTime() + 60_000).toISOString() });
    expect(validateQuote(quote, { stalenessSeconds: 60, now }).status).toBe("future_dated");
  });

  it("rejects a stale quote older than the threshold", () => {
    const quote = baseQuote({ sourceTimestamp: new Date(now.getTime() - 120_000).toISOString() });
    expect(validateQuote(quote, { stalenessSeconds: 60, now }).status).toBe("stale");
  });

  it("rejects a malformed timestamp", () => {
    const quote = baseQuote({ sourceTimestamp: "not-a-date" });
    expect(validateQuote(quote, { stalenessSeconds: 60, now }).status).toBe("malformed");
  });

  it("tolerates small positive clock skew within the future tolerance", () => {
    const quote = baseQuote({ sourceTimestamp: new Date(now.getTime() + 2000).toISOString() });
    expect(validateQuote(quote, { stalenessSeconds: 60, now }).status).toBe("ok");
  });
});

describe("getQuote", () => {
  it("logs the fetch attempt to market_data_snapshots including rejected quotes", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as SupabaseClient<Database>;

    const staleQuote = baseQuote({ sourceTimestamp: new Date(Date.now() - 120_000).toISOString() });
    const broker = { getLatestQuote: vi.fn().mockResolvedValue(staleQuote) } as unknown as ReadOnlyBrokerAdapter;

    const result = await getQuote(broker, supabase, {
      userId: "user-1",
      accountId: "account-1",
      symbol: "AAPL",
      stalenessSeconds: 60,
    });

    expect(result.validation.status).toBe("stale");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "AAPL", validation_status: "stale" })
    );
  });
});
