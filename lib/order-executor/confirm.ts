import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createManualProposal, deleteProposal, getProposalByClientOrderId } from "@/lib/repositories/proposals-repository";
import { logCriticalEvent } from "@/lib/repositories/audit-log-repository";

export class DuplicateSubmissionError extends Error {
  constructor(clientOrderId: string) {
    super(`An order with client_order_id "${clientOrderId}" has already been submitted.`);
    this.name = "DuplicateSubmissionError";
  }
}

type ManualProposalInput = Omit<Database["public"]["Tables"]["proposals"]["Insert"], "source" | "status">;

/**
 * Confirms a manual order ticket. This is the "human approval" moment —
 * the proposal row is inserted with status: 'approved' directly (there is
 * no separate async 'pending' review step for manual orders; the ticket's
 * own confirmation screen already was that review).
 *
 * Two critical, fail-closed audit events:
 * - `duplicate_submission_blocked`: if a proposal already exists for this
 *   client_order_id, the request is refused. Even if THIS audit write
 *   itself fails, the function still throws (DuplicateSubmissionError or
 *   the audit error, whichever occurs) — fail closed means refuse either
 *   way, never silently allow a duplicate through.
 * - `manual_order_confirmed`: written immediately after the proposal is
 *   inserted. If it fails, the just-inserted proposal is deleted
 *   (compensating rollback — safe, since nothing has executed yet) and the
 *   error propagates. There is never a confirmed proposal with no audit
 *   trail explaining how it got there.
 */
export async function confirmManualOrder(supabase: SupabaseClient<Database>, input: ManualProposalInput) {
  const existing = await getProposalByClientOrderId(supabase, input.client_order_id);

  if (existing) {
    await logCriticalEvent(supabase, {
      userId: input.user_id,
      accountId: input.account_id,
      eventType: "duplicate_submission_blocked",
      entityType: "proposal",
      entityId: existing.id,
      payload: { clientOrderId: input.client_order_id },
    });
    throw new DuplicateSubmissionError(input.client_order_id);
  }

  const proposal = await createManualProposal(supabase, input);

  try {
    await logCriticalEvent(supabase, {
      userId: proposal.user_id,
      accountId: proposal.account_id,
      eventType: "manual_order_confirmed",
      entityType: "proposal",
      entityId: proposal.id,
      payload: {
        symbol: proposal.symbol,
        direction: proposal.direction,
        qty: proposal.qty,
        orderType: proposal.order_type,
      },
    });
  } catch (auditError) {
    await deleteProposal(supabase, proposal.id);
    throw auditError;
  }

  return proposal;
}
