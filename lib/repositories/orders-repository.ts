import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { BrokerOrder } from "@/lib/broker/types";
import type { LocalOrderResult } from "@/lib/local-broker/types";

/**
 * Records a LOCAL SIMULATION order — the only kind of order this app can
 * ever create in Phase 1. `is_simulated` is always true here;
 * `simulation_metadata` carries the full fill-model/reference-quote/
 * slippage/engine-version record from lib/local-broker/. Never called with
 * anything from lib/broker/ — see lib/order-executor/executor.ts.
 */
export async function recordLocalOrder(
  supabase: SupabaseClient<Database>,
  params: { userId: string; accountId: string; proposalId: string; clientOrderId: string; result: LocalOrderResult }
) {
  const { userId, accountId, proposalId, clientOrderId, result } = params;
  const { error } = await supabase.from("orders").insert({
    user_id: userId,
    account_id: accountId,
    proposal_id: proposalId,
    broker_order_id: result.localOrderId,
    client_order_id: clientOrderId,
    status: mapLocalStatusToOrderStatus(result.status),
    filled_qty: result.filledQty,
    filled_avg_price: result.filledAvgPrice,
    filled_at: result.filledAt,
    is_simulated: true,
    simulation_metadata: result.metadata as unknown as Record<string, unknown>,
  });

  if (error) throw new Error(`Failed to record local order: ${error.message}`);
}

function mapLocalStatusToOrderStatus(status: LocalOrderResult["status"]): Database["public"]["Tables"]["orders"]["Row"]["status"] {
  if (status === "filled") return "filled";
  if (status === "open") return "accepted";
  return "rejected";
}

/**
 * Reserved for a future account-sync module: reconciles Alpaca's own
 * order history (read-only, via getRecentOrders — a symbol the user placed
 * directly on Alpaca's own dashboard, outside this app entirely) against
 * our local record, purely for informational display. Not called by
 * anything in this pass — order placement itself never uses this.
 */
export async function createOrderFromBrokerOrder(
  supabase: SupabaseClient<Database>,
  params: { userId: string; accountId: string; proposalId: string; brokerOrder: BrokerOrder }
) {
  const { userId, accountId, proposalId, brokerOrder } = params;
  const { error } = await supabase.from("orders").insert({
    user_id: userId,
    account_id: accountId,
    proposal_id: proposalId,
    broker_order_id: brokerOrder.brokerOrderId,
    client_order_id: brokerOrder.clientOrderId,
    status: brokerOrder.status as Database["public"]["Tables"]["orders"]["Row"]["status"],
    is_simulated: false,
  });

  if (error) throw new Error(`Failed to record order: ${error.message}`);
}

/**
 * Used by account-sync to reconcile broker-reported order state against our
 * own record of the same order. Deliberately UPDATE-only, not a true
 * upsert: `orders.proposal_id` is NOT NULL (every order in this schema
 * traces back to a proposal — see 0001_init.sql), so there is no safe way
 * to insert a brand-new row here for an order account-sync doesn't already
 * know about. If `client_order_id` doesn't match an existing row (e.g. an
 * order placed outside this app entirely, directly against the broker),
 * this is a silent no-op — reconciling genuinely out-of-band orders is not
 * in scope for Phase 1.
 */
export async function updateOrderStatusByClientOrderId(
  supabase: SupabaseClient<Database>,
  brokerOrder: BrokerOrder
) {
  const { error } = await supabase
    .from("orders")
    .update({
      broker_order_id: brokerOrder.brokerOrderId,
      status: brokerOrder.status as Database["public"]["Tables"]["orders"]["Row"]["status"],
      filled_qty: brokerOrder.filledQty,
      filled_avg_price: brokerOrder.filledAvgPrice,
      filled_at: brokerOrder.filledAt,
    })
    .eq("client_order_id", brokerOrder.clientOrderId);

  if (error) throw new Error(`Failed to update order status: ${error.message}`);
}

/** Local DB read only — used by lib/order-executor/local-reconcile.ts to
 * resolve a proposal stuck in 'executing' without any network call. Not
 * to be confused with the broker's (removed) getOrderByClientOrderId,
 * which looked up an order at Alpaca; this only ever looks at our own
 * `orders` table. */
export async function findOrderByClientOrderId(supabase: SupabaseClient<Database>, clientOrderId: string) {
  const { data, error } = await supabase.from("orders").select("*").eq("client_order_id", clientOrderId).maybeSingle();
  if (error) throw new Error(`Failed to look up order by client_order_id: ${error.message}`);
  return data;
}

export async function listRecentOrders(supabase: SupabaseClient<Database>, accountId: string, limit = 50) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("account_id", accountId)
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list recent orders: ${error.message}`);
  return data;
}
