// The Proposal Validator: deterministic, pure functions only — no DB or
// broker calls in this file. Callers (API routes) gather everything these
// functions need (account, risk limits, a freshly-validated quote, market
// status, position/buying-power state) and pass it in, which is what keeps
// this module honestly independent of both the Signal Engine and the AI
// rationale layer, and fully unit-testable without mocking Supabase.

import type { Database } from "@/types/database";
import type { QuoteValidationResult } from "@/lib/market-data/types";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
type RiskLimitsRow = Database["public"]["Tables"]["risk_limits"]["Row"];
type ProposalRow = Database["public"]["Tables"]["proposals"]["Row"];

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  estimatedPrice: number;
  estimatedCost: number;
}

export interface OrderDraft {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  qty: number;
  limitPrice?: number;
}

export interface ValidateOrderInput {
  account: AccountRow;
  riskLimits: RiskLimitsRow;
  order: OrderDraft;
  quoteBidPrice: number | null;
  quoteAskPrice: number | null;
  quoteValidation: QuoteValidationResult;
  marketOpen: boolean;
  /** A proposals row already found by client_order_id, if any — a non-null
   * value here means this exact submission was already made. */
  existingProposal: ProposalRow | null;
  openPositionCount: number;
  latestEquity: number;
  latestBuyingPower: number;
}

/**
 * Every check a manual order ticket must pass BEFORE a proposals row is
 * ever created — universe membership is checked separately by
 * assertSymbolInUniverse (lib/market-data/universe.ts) before this is ever
 * called, since it's a distinct concern from these numeric/state checks.
 */
export function validateOrder(input: ValidateOrderInput): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (input.existingProposal) {
    issues.push({
      code: "duplicate_submission",
      message: "An order with this confirmation has already been submitted.",
    });
  }

  if (input.account.mode !== "paper") {
    issues.push({ code: "not_paper_mode", message: "Only paper-mode accounts can submit orders in Phase 1." });
  }

  if (input.account.kill_switch_enabled) {
    issues.push({
      code: "kill_switch_engaged",
      message: "The kill switch is engaged — no new orders can be submitted until it's turned off.",
    });
  }

  if (!input.marketOpen) {
    issues.push({ code: "market_closed", message: "The market is currently closed." });
  }

  if (!Number.isInteger(input.order.qty) || input.order.qty <= 0) {
    issues.push({ code: "invalid_quantity", message: "Quantity must be a positive whole number of shares." });
  }

  if (input.order.type === "limit") {
    if (
      input.order.limitPrice === undefined ||
      !Number.isFinite(input.order.limitPrice) ||
      input.order.limitPrice <= 0
    ) {
      issues.push({ code: "invalid_limit_price", message: "Limit price must be a positive number." });
    }
  }

  if (input.quoteValidation.status !== "ok") {
    issues.push({
      code: `quote_${input.quoteValidation.status}`,
      message: `Quote is not usable: ${input.quoteValidation.notes ?? input.quoteValidation.status}`,
    });
  }

  const referencePrice = input.order.side === "buy" ? input.quoteAskPrice : input.quoteBidPrice;
  const estimatedPrice =
    input.order.type === "limit" && input.order.limitPrice !== undefined ? input.order.limitPrice : referencePrice ?? 0;
  const qtyForEstimate = Number.isFinite(input.order.qty) && input.order.qty > 0 ? input.order.qty : 0;
  const estimatedCost = estimatedPrice * qtyForEstimate;

  if (input.order.side === "buy" && estimatedCost > input.latestBuyingPower) {
    issues.push({
      code: "insufficient_buying_power",
      message: `Estimated cost $${estimatedCost.toFixed(2)} exceeds available buying power $${input.latestBuyingPower.toFixed(2)}.`,
    });
  }

  const maxPositionValue = input.latestEquity * input.riskLimits.max_position_pct;
  if (input.order.side === "buy" && estimatedCost > maxPositionValue) {
    issues.push({
      code: "exceeds_max_position_pct",
      message: `Estimated position value $${estimatedCost.toFixed(2)} exceeds the configured max position size of $${maxPositionValue.toFixed(2)} (${(input.riskLimits.max_position_pct * 100).toFixed(1)}% of equity).`,
    });
  }

  if (input.order.side === "buy" && input.openPositionCount >= input.riskLimits.max_concurrent_positions) {
    issues.push({
      code: "exceeds_max_concurrent_positions",
      message: `Already holding ${input.openPositionCount} position(s), at the configured max of ${input.riskLimits.max_concurrent_positions}.`,
    });
  }

  return { ok: issues.length === 0, issues, estimatedPrice, estimatedCost };
}

export interface ValidateBeforeExecutionInput {
  proposal: Pick<ProposalRow, "expires_at" | "entry_price">;
  now?: Date;
  currentPrice: number;
  maxSlippagePct: number;
  marketOpen: boolean;
  quoteValidation: QuoteValidationResult;
}

/**
 * Re-checked immediately before the Order Executor's atomic
 * approved -> executing transition — time may have passed since the
 * proposal was created (confirm-click delay, retry, etc.), so nothing here
 * is trusted from proposal-creation time.
 */
export function validateProposalBeforeExecution(input: ValidateBeforeExecutionInput): ValidationResult {
  const now = input.now ?? new Date();
  const issues: ValidationIssue[] = [];

  if (new Date(input.proposal.expires_at) <= now) {
    issues.push({ code: "proposal_expired", message: "This order confirmation has expired — please start over." });
  }

  if (!input.marketOpen) {
    issues.push({ code: "market_closed", message: "The market closed before this order could be submitted." });
  }

  if (input.quoteValidation.status !== "ok") {
    issues.push({
      code: `quote_${input.quoteValidation.status}`,
      message: `Quote is no longer usable: ${input.quoteValidation.notes ?? input.quoteValidation.status}`,
    });
  }

  const priceMovePct = Math.abs(input.currentPrice - input.proposal.entry_price) / input.proposal.entry_price;
  if (priceMovePct > input.maxSlippagePct) {
    issues.push({
      code: "price_moved_beyond_tolerance",
      message: `Price has moved ${(priceMovePct * 100).toFixed(2)}%, beyond the configured ${(input.maxSlippagePct * 100).toFixed(2)}% tolerance.`,
    });
  }

  return { ok: issues.length === 0, issues, estimatedPrice: input.currentPrice, estimatedCost: 0 };
}
