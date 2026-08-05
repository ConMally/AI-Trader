import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getProposalById,
  markExecuted,
  markFailed,
  revertToApproved,
  transitionToExecuting,
} from "@/lib/repositories/proposals-repository";
import { recordLocalOrder } from "@/lib/repositories/orders-repository";
import { logCriticalEvent, logEventSafely } from "@/lib/repositories/audit-log-repository";
import { validateProposalBeforeExecution, type ValidationIssue } from "@/lib/validator/proposal-validator";
import type { QuoteValidationResult } from "@/lib/market-data/types";
import { LocalOnlyOrderRecorder } from "@/lib/local-broker/local-order-recorder";
import type { LocalOrderResult } from "@/lib/local-broker/types";

export interface ExecuteQuote {
  bidPrice: number | null;
  askPrice: number | null;
  lastPrice: number | null;
  sourceTimestamp: string;
  validation: QuoteValidationResult;
}

export type ExecuteProposalOutcome =
  | { status: "already_handled" }
  | { status: "rejected_by_validation"; issues: ValidationIssue[] }
  | { status: "audit_failed_before_execution"; error: string }
  | { status: "execution_rejected"; order: LocalOrderResult }
  | { status: "executed"; order: LocalOrderResult }
  | { status: "execution_recorded_but_audit_failed"; order: LocalOrderResult; error: string };

export interface ExecuteProposalParams {
  supabase: SupabaseClient<Database>;
  /** Concrete class, not an interface — nothing Alpaca-backed can satisfy
   * this shape (AlpacaPaperAdapter has no submitOrder method at all after
   * the Phase 1 recovery pass). This is what makes "only the local adapter
   * can be selected here" a fact about the type system, not a convention. */
  recorder: LocalOnlyOrderRecorder;
  proposalId: string;
  /** Fetched fresh by the caller immediately before calling this function
   * — never trust a value computed earlier in the request. */
  quote: ExecuteQuote;
  marketOpen: boolean;
  maxSlippagePct: number;
}

/**
 * Executes an already-confirmed ('approved') proposal against the local
 * simulator ONLY. Re-validates everything fresh, transitions atomically,
 * and never calls anything under lib/broker/ — there is no import of it
 * anywhere in this file.
 */
export async function executeProposal(params: ExecuteProposalParams): Promise<ExecuteProposalOutcome> {
  const { supabase, recorder, proposalId, quote, marketOpen, maxSlippagePct } = params;

  const proposal = await getProposalById(supabase, proposalId);

  // Cheap early exit for a repeated call (double-click, retry) — no need
  // to re-validate or touch the local recorder at all if this proposal has
  // already moved past 'approved'.
  if (proposal.status !== "approved") {
    await logCriticalEvent(supabase, {
      userId: proposal.user_id,
      accountId: proposal.account_id,
      eventType: "duplicate_submission_blocked",
      entityType: "proposal",
      entityId: proposal.id,
      payload: { currentStatus: proposal.status },
    });
    return { status: "already_handled" };
  }

  const validation = validateProposalBeforeExecution({
    proposal: { expires_at: proposal.expires_at, entry_price: proposal.entry_price },
    currentPrice:
      proposal.direction === "buy" ? (quote.askPrice ?? proposal.entry_price) : (quote.bidPrice ?? proposal.entry_price),
    maxSlippagePct,
    marketOpen,
    quoteValidation: quote.validation,
  });

  if (!validation.ok) {
    await markFailed(supabase, proposal.id); // 'approved' -> 'failed' directly; never entered 'executing'.
    await logCriticalEvent(supabase, {
      userId: proposal.user_id,
      accountId: proposal.account_id,
      eventType: "order_execution_rejected",
      entityType: "proposal",
      entityId: proposal.id,
      payload: { issues: validation.issues.map((i) => i.code) },
    });
    return { status: "rejected_by_validation", issues: validation.issues };
  }

  const executing = await transitionToExecuting(supabase, proposal.id);
  if (!executing) {
    // Someone else (a concurrent call for the same proposal) already
    // claimed it between our read above and this attempt.
    return { status: "already_handled" };
  }

  try {
    await logCriticalEvent(supabase, {
      userId: proposal.user_id,
      accountId: proposal.account_id,
      eventType: "order_execution_started",
      entityType: "proposal",
      entityId: proposal.id,
      payload: { symbol: proposal.symbol, direction: proposal.direction, qty: proposal.qty },
    });
  } catch (auditError) {
    // Nothing has been filled yet — safe to revert.
    await revertToApproved(supabase, proposal.id);
    return { status: "audit_failed_before_execution", error: String(auditError) };
  }

  const order = recorder.submitLocalOrder(
    {
      clientOrderId: proposal.client_order_id,
      symbol: proposal.symbol,
      side: proposal.direction,
      type: proposal.order_type,
      qty: proposal.qty,
      limitPrice: proposal.order_type === "limit" ? proposal.entry_price : undefined,
    },
    { bidPrice: quote.bidPrice, askPrice: quote.askPrice, lastPrice: quote.lastPrice, sourceTimestamp: quote.sourceTimestamp }
  );

  await recordLocalOrder(supabase, {
    userId: proposal.user_id,
    accountId: proposal.account_id,
    proposalId: proposal.id,
    clientOrderId: proposal.client_order_id,
    result: order,
  });

  if (order.status === "rejected") {
    await markFailed(supabase, proposal.id);
    await logCriticalEvent(supabase, {
      userId: proposal.user_id,
      accountId: proposal.account_id,
      eventType: "order_execution_rejected",
      entityType: "proposal",
      entityId: proposal.id,
      payload: { reason: order.rejectionReason ?? "unknown" },
    });
    return { status: "execution_rejected", order };
  }

  await markExecuted(supabase, proposal.id);

  try {
    await logCriticalEvent(supabase, {
      userId: proposal.user_id,
      accountId: proposal.account_id,
      eventType: "order_execution_succeeded",
      entityType: "proposal",
      entityId: proposal.id,
      payload: { localOrderId: order.localOrderId, status: order.status, filledQty: order.filledQty },
    });
  } catch (auditError) {
    // The local fill already happened and is durably recorded in `orders`
    // — this cannot be cleanly rolled back the way a pre-fill audit
    // failure can. Escalate instead of hiding it: never return a plain
    // "executed" result when the audit trail for it is missing.
    return { status: "execution_recorded_but_audit_failed", order, error: String(auditError) };
  }

  // Best-effort, informational only — does not affect the outcome either way.
  await logEventSafely(supabase, {
    userId: proposal.user_id,
    accountId: proposal.account_id,
    eventType: "local_order_recorded",
    entityType: "order",
    entityId: proposal.id,
    payload: { localOrderId: order.localOrderId },
  });

  return { status: "executed", order };
}
