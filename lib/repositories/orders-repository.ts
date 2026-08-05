import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
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

export interface FilledSimulatedOrderWithDirection {
  symbol: string;
  direction: Database["public"]["Tables"]["proposals"]["Row"]["direction"];
  qty: number;
  filledAvgPrice: number;
  submittedAt: string;
}

/**
 * Every filled LOCAL SIMULATION order for an account, joined with its
 * proposal's symbol/direction (orders itself has neither column — only
 * `proposals` does). Ordered oldest-first so lib/local-broker/local-
 * portfolio.ts can walk it as a ledger. Two queries rather than a
 * PostgREST embedded select: this project's hand-written Database type
 * declares no foreign-key `Relationships`, so embedding isn't set up, and
 * two plain queries plus an in-memory join is simple enough not to need it.
 */
export async function listFilledSimulatedOrdersWithDirection(
  supabase: SupabaseClient<Database>,
  accountId: string
): Promise<FilledSimulatedOrderWithDirection[]> {
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_simulated", true)
    .eq("status", "filled")
    .order("submitted_at", { ascending: true });

  if (ordersError) throw new Error(`Failed to list filled simulated orders: ${ordersError.message}`);
  if (orders.length === 0) return [];

  const proposalIds = orders.map((o) => o.proposal_id);
  const { data: proposals, error: proposalsError } = await supabase
    .from("proposals")
    .select("id, symbol, direction")
    .in("id", proposalIds);

  if (proposalsError) throw new Error(`Failed to load proposals for portfolio computation: ${proposalsError.message}`);

  const proposalById = new Map(proposals.map((p) => [p.id, p]));

  return orders
    .filter((o) => o.filled_avg_price !== null)
    .map((o) => {
      const proposal = proposalById.get(o.proposal_id);
      if (!proposal) {
        throw new Error(`Order ${o.id} references proposal ${o.proposal_id}, which no longer exists.`);
      }
      return {
        symbol: proposal.symbol,
        direction: proposal.direction,
        qty: o.filled_qty,
        filledAvgPrice: o.filled_avg_price as number,
        submittedAt: o.submitted_at,
      };
    });
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

/** Every order this table can ever hold is a LOCAL SIMULATION order
 * (`is_simulated = true`) — Alpaca's own order history is fetched live for
 * display and never persisted here (see lib/account-sync/README.md), so no
 * `is_simulated` filter is needed for this to mean "local simulated
 * orders." */
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

export interface RecentOrderWithSymbol {
  id: string;
  symbol: string;
  direction: Database["public"]["Tables"]["proposals"]["Row"]["direction"];
  orderType: Database["public"]["Tables"]["proposals"]["Row"]["order_type"];
  qty: number;
  filledQty: number;
  filledAvgPrice: number | null;
  status: Database["public"]["Tables"]["orders"]["Row"]["status"];
  submittedAt: string;
}

/** Same two-query join as listFilledSimulatedOrdersWithDirection, but for
 * every status (not just 'filled') — used purely for display
 * (LocalOrdersTable), not for portfolio math. */
export async function listRecentOrdersWithSymbol(
  supabase: SupabaseClient<Database>,
  accountId: string,
  limit = 20
): Promise<RecentOrderWithSymbol[]> {
  const orders = await listRecentOrders(supabase, accountId, limit);
  if (orders.length === 0) return [];

  const proposalIds = orders.map((o) => o.proposal_id);
  const { data: proposals, error } = await supabase.from("proposals").select("id, symbol, direction, order_type, qty").in("id", proposalIds);
  if (error) throw new Error(`Failed to load proposals for order display: ${error.message}`);

  const proposalById = new Map(proposals.map((p) => [p.id, p]));

  return orders.flatMap((o) => {
    const proposal = proposalById.get(o.proposal_id);
    if (!proposal) return [];
    return [
      {
        id: o.id,
        symbol: proposal.symbol,
        direction: proposal.direction,
        orderType: proposal.order_type,
        qty: proposal.qty,
        filledQty: o.filled_qty,
        filledAvgPrice: o.filled_avg_price,
        status: o.status,
        submittedAt: o.submitted_at,
      },
    ];
  });
}
