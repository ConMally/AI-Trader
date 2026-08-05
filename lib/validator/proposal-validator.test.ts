import { describe, expect, it } from "vitest";
import { validateOrder, validateProposalBeforeExecution, type ValidateOrderInput } from "./proposal-validator";
import type { Database } from "@/types/database";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
type RiskLimitsRow = Database["public"]["Tables"]["risk_limits"]["Row"];

function account(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: "acct-1",
    user_id: "user-1",
    mode: "paper",
    broker: "alpaca",
    starting_balance: 1000,
    kill_switch_enabled: false,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function riskLimits(overrides: Partial<RiskLimitsRow> = {}): RiskLimitsRow {
  return {
    id: "rl-1",
    account_id: "acct-1",
    risk_per_trade_pct: 0.005,
    max_position_pct: 0.2,
    max_daily_loss_pct: 0.03,
    max_concurrent_positions: 5,
    max_price_slippage_pct: 0.005,
    quote_staleness_seconds: 60,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseInput(overrides: Partial<ValidateOrderInput> = {}): ValidateOrderInput {
  return {
    account: account(),
    riskLimits: riskLimits(),
    order: { symbol: "AAPL", side: "buy", type: "market", qty: 1 },
    quoteBidPrice: 100,
    quoteAskPrice: 100.05,
    quoteValidation: { status: "ok" },
    marketOpen: true,
    existingProposal: null,
    openPositionCount: 0,
    latestEquity: 1000,
    latestBuyingPower: 1000,
    ...overrides,
  };
}

describe("validateOrder", () => {
  it("accepts a well-formed order with everything in a good state", () => {
    const result = validateOrder(baseInput());
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects a non-integer or non-positive quantity", () => {
    expect(validateOrder(baseInput({ order: { symbol: "AAPL", side: "buy", type: "market", qty: 0 } })).ok).toBe(false);
    expect(validateOrder(baseInput({ order: { symbol: "AAPL", side: "buy", type: "market", qty: -1 } })).ok).toBe(false);
    expect(
      validateOrder(baseInput({ order: { symbol: "AAPL", side: "buy", type: "market", qty: 1.5 } })).issues[0].code
    ).toBe("invalid_quantity");
  });

  it("rejects a limit order with a missing or non-positive limit price", () => {
    const result = validateOrder(baseInput({ order: { symbol: "AAPL", side: "buy", type: "limit", qty: 1 } }));
    expect(result.issues.some((i) => i.code === "invalid_limit_price")).toBe(true);

    const negative = validateOrder(
      baseInput({ order: { symbol: "AAPL", side: "buy", type: "limit", qty: 1, limitPrice: -5 } })
    );
    expect(negative.issues.some((i) => i.code === "invalid_limit_price")).toBe(true);
  });

  it("rejects when the kill switch is engaged", () => {
    const result = validateOrder(baseInput({ account: account({ kill_switch_enabled: true }) }));
    expect(result.issues.some((i) => i.code === "kill_switch_engaged")).toBe(true);
  });

  it("rejects when the market is closed", () => {
    const result = validateOrder(baseInput({ marketOpen: false }));
    expect(result.issues.some((i) => i.code === "market_closed")).toBe(true);
  });

  it("rejects when the account is not in paper mode", () => {
    const result = validateOrder(baseInput({ account: account({ mode: "live" }) }));
    expect(result.issues.some((i) => i.code === "not_paper_mode")).toBe(true);
  });

  it("rejects a stale/crossed/malformed quote by propagating its validation status", () => {
    const stale = validateOrder(baseInput({ quoteValidation: { status: "stale" } }));
    expect(stale.issues.some((i) => i.code === "quote_stale")).toBe(true);

    const crossed = validateOrder(baseInput({ quoteValidation: { status: "crossed" } }));
    expect(crossed.issues.some((i) => i.code === "quote_crossed")).toBe(true);
  });

  it("rejects insufficient buying power on a buy order", () => {
    const result = validateOrder(
      baseInput({ order: { symbol: "AAPL", side: "buy", type: "market", qty: 100 }, latestBuyingPower: 50 })
    );
    expect(result.issues.some((i) => i.code === "insufficient_buying_power")).toBe(true);
  });

  it("does not apply the buying-power check to a sell order", () => {
    const result = validateOrder(
      baseInput({ order: { symbol: "AAPL", side: "sell", type: "market", qty: 1 }, latestBuyingPower: 0 })
    );
    expect(result.issues.some((i) => i.code === "insufficient_buying_power")).toBe(false);
  });

  it("rejects a position that would exceed max_position_pct of equity", () => {
    const result = validateOrder(
      baseInput({
        order: { symbol: "AAPL", side: "buy", type: "market", qty: 100 },
        latestEquity: 1000,
        latestBuyingPower: 100_000,
        riskLimits: riskLimits({ max_position_pct: 0.2 }),
      })
    );
    // 100 * ~100.05 = ~10,005, max allowed = 1000 * 0.2 = 200
    expect(result.issues.some((i) => i.code === "exceeds_max_position_pct")).toBe(true);
  });

  it("rejects a new buy once max_concurrent_positions is already reached", () => {
    const result = validateOrder(baseInput({ openPositionCount: 5, riskLimits: riskLimits({ max_concurrent_positions: 5 }) }));
    expect(result.issues.some((i) => i.code === "exceeds_max_concurrent_positions")).toBe(true);
  });

  it("flags a duplicate submission when a proposal already exists for this client_order_id", () => {
    const result = validateOrder(
      baseInput({
        existingProposal: {
          id: "p1",
          user_id: "user-1",
          account_id: "acct-1",
          signal_id: null,
          symbol: "AAPL",
          direction: "buy",
          qty: 1,
          entry_price: 100,
          stop_price: null,
          target_price: null,
          risk_amount: null,
          rationale: null,
          risk_notes: [],
          ai_model: null,
          source: "manual",
          order_type: "market",
          status: "executed",
          client_order_id: "abc",
          expires_at: "2024-01-01T00:00:00.000Z",
          decided_at: null,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      })
    );
    expect(result.issues.some((i) => i.code === "duplicate_submission")).toBe(true);
  });
});

describe("validateProposalBeforeExecution", () => {
  const now = new Date("2024-06-01T14:30:00.000Z");

  it("passes when nothing has changed and everything is fresh", () => {
    const result = validateProposalBeforeExecution({
      proposal: { expires_at: new Date(now.getTime() + 60_000).toISOString(), entry_price: 100 },
      now,
      currentPrice: 100.02,
      maxSlippagePct: 0.005,
      marketOpen: true,
      quoteValidation: { status: "ok" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an expired confirmation", () => {
    const result = validateProposalBeforeExecution({
      proposal: { expires_at: new Date(now.getTime() - 1000).toISOString(), entry_price: 100 },
      now,
      currentPrice: 100,
      maxSlippagePct: 0.005,
      marketOpen: true,
      quoteValidation: { status: "ok" },
    });
    expect(result.issues.some((i) => i.code === "proposal_expired")).toBe(true);
  });

  it("rejects when price has moved beyond the configured tolerance", () => {
    const result = validateProposalBeforeExecution({
      proposal: { expires_at: new Date(now.getTime() + 60_000).toISOString(), entry_price: 100 },
      now,
      currentPrice: 103, // 3% move
      maxSlippagePct: 0.005, // 0.5% tolerance
      marketOpen: true,
      quoteValidation: { status: "ok" },
    });
    expect(result.issues.some((i) => i.code === "price_moved_beyond_tolerance")).toBe(true);
  });

  it("rejects when the market has since closed", () => {
    const result = validateProposalBeforeExecution({
      proposal: { expires_at: new Date(now.getTime() + 60_000).toISOString(), entry_price: 100 },
      now,
      currentPrice: 100,
      maxSlippagePct: 0.005,
      marketOpen: false,
      quoteValidation: { status: "ok" },
    });
    expect(result.issues.some((i) => i.code === "market_closed")).toBe(true);
  });

  it("rejects when the quote is no longer fresh", () => {
    const result = validateProposalBeforeExecution({
      proposal: { expires_at: new Date(now.getTime() + 60_000).toISOString(), entry_price: 100 },
      now,
      currentPrice: 100,
      maxSlippagePct: 0.005,
      marketOpen: true,
      quoteValidation: { status: "stale" },
    });
    expect(result.issues.some((i) => i.code === "quote_stale")).toBe(true);
  });
});
