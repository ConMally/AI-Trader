import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getProposalById, markExecuted, revertToApproved } from "@/lib/repositories/proposals-repository";
import { findOrderByClientOrderId } from "@/lib/repositories/orders-repository";
import { logCriticalEvent } from "@/lib/repositories/audit-log-repository";

export type LocalReconciliationOutcome =
  | { result: "already_resolved" }
  | { result: "order_found_marked_executed" }
  | { result: "no_order_found_reverted_to_approved" };

/**
 * Resolves a proposal stuck in 'executing' (e.g. the process crashed
 * between transitionToExecuting and markExecuted) using ONLY our own
 * database — no network call of any kind, since order placement never
 * left this server to begin with. There is nothing "ambiguous" left to
 * resolve against an external broker; the only question is whether an
 * `orders` row was durably recorded before the crash, and
 * `orders.proposal_id`'s unique constraint (0001_init.sql) guarantees at
 * most one such row per proposal.
 */
export async function reconcileStuckProposal(
  supabase: SupabaseClient<Database>,
  proposalId: string
): Promise<LocalReconciliationOutcome> {
  const proposal = await getProposalById(supabase, proposalId);

  if (proposal.status !== "executing") {
    return { result: "already_resolved" };
  }

  const order = await findOrderByClientOrderId(supabase, proposal.client_order_id);

  if (order) {
    await markExecuted(supabase, proposal.id);
    await logCriticalEvent(supabase, {
      userId: proposal.user_id,
      accountId: proposal.account_id,
      eventType: "local_state_reconciled",
      entityType: "proposal",
      entityId: proposal.id,
      payload: { resolution: "order_found", orderId: order.id },
    });
    return { result: "order_found_marked_executed" };
  }

  await revertToApproved(supabase, proposal.id);
  await logCriticalEvent(supabase, {
    userId: proposal.user_id,
    accountId: proposal.account_id,
    eventType: "local_state_reconciled",
    entityType: "proposal",
    entityId: proposal.id,
    payload: { resolution: "no_order_found_reverted" },
  });
  return { result: "no_order_found_reverted_to_approved" };
}
