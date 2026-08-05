import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ProposalInsert = Database["public"]["Tables"]["proposals"]["Insert"];

export async function getProposalByClientOrderId(supabase: SupabaseClient<Database>, clientOrderId: string) {
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("client_order_id", clientOrderId)
    .maybeSingle();

  if (error) throw new Error(`Failed to look up proposal by client_order_id: ${error.message}`);
  return data;
}

export async function getProposalById(supabase: SupabaseClient<Database>, id: string) {
  const { data, error } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (error) throw new Error(`Failed to load proposal ${id}: ${error.message}`);
  return data;
}

/**
 * Inserts a manual order ticket as an already-'approved' proposal (source =
 * 'manual') — the human approval already happened via the ticket's
 * confirmation screen before this row is created; there is no separate
 * async 'pending' review step for manual orders the way there will be for
 * AI-generated ones (Phase 4/5). The DB's `client_order_id` unique
 * constraint (0001_init.sql) is what actually prevents a double insert if
 * this is somehow called twice for the same client_order_id — this
 * function itself does not pre-check for that; callers must handle the
 * unique-violation case (see lib/order-executor/executor.ts).
 */
export async function createManualProposal(
  supabase: SupabaseClient<Database>,
  proposal: Omit<ProposalInsert, "source" | "status">
) {
  const { data, error } = await supabase
    .from("proposals")
    .insert({ ...proposal, source: "manual", status: "approved" })
    .select()
    .single();

  if (error) throw new Error(`Failed to create manual proposal: ${error.message}`);
  return data;
}

/**
 * The atomic approve -> executing transition. A single conditional UPDATE
 * guarded by the current status: if another request already moved this
 * proposal out of 'approved' (e.g. a duplicate confirm-click racing this
 * one), zero rows match and `null` is returned — the caller must treat
 * that as "someone else is already handling this," never retry the
 * transition itself.
 */
export async function transitionToExecuting(supabase: SupabaseClient<Database>, proposalId: string) {
  const { data, error } = await supabase
    .from("proposals")
    .update({ status: "executing" })
    .eq("id", proposalId)
    .eq("status", "approved")
    .select()
    .maybeSingle();

  if (error) throw new Error(`Failed to transition proposal ${proposalId} to executing: ${error.message}`);
  return data;
}

export async function markExecuted(supabase: SupabaseClient<Database>, proposalId: string) {
  const { error } = await supabase
    .from("proposals")
    .update({ status: "executed", decided_at: new Date().toISOString() })
    .eq("id", proposalId);

  if (error) throw new Error(`Failed to mark proposal ${proposalId} executed: ${error.message}`);
}

/**
 * Reverts a proposal from 'executing' back to 'approved' — used only when
 * local reconciliation has confirmed no order was ever recorded for it (see
 * lib/order-executor/local-reconcile.ts), or when execution-time
 * re-validation fails before any fill happens (lib/order-executor/executor.ts).
 * Guarded by the current status the same way transitionToExecuting is, so
 * this can't accidentally revert a proposal a concurrent process has since
 * moved on from.
 */
export async function revertToApproved(supabase: SupabaseClient<Database>, proposalId: string) {
  const { error } = await supabase
    .from("proposals")
    .update({ status: "approved" })
    .eq("id", proposalId)
    .eq("status", "executing");

  if (error) throw new Error(`Failed to revert proposal ${proposalId} to approved: ${error.message}`);
}

export async function markFailed(supabase: SupabaseClient<Database>, proposalId: string) {
  const { error } = await supabase
    .from("proposals")
    .update({ status: "failed", decided_at: new Date().toISOString() })
    .eq("id", proposalId);

  if (error) throw new Error(`Failed to mark proposal ${proposalId} failed: ${error.message}`);
}

/**
 * Compensating rollback used ONLY by lib/order-executor/confirm.ts: if the
 * critical `manual_order_confirmed` audit write fails immediately after a
 * proposal is inserted, the proposal is deleted rather than left sitting in
 * 'approved' with no audit trail explaining how it got there. This is the
 * one place in the codebase a proposal row is ever deleted rather than
 * transitioned — every other path only ever changes `status`.
 */
export async function deleteProposal(supabase: SupabaseClient<Database>, proposalId: string) {
  const { error } = await supabase.from("proposals").delete().eq("id", proposalId).eq("status", "approved");
  if (error) throw new Error(`Failed to delete proposal ${proposalId} during compensating rollback: ${error.message}`);
}
