import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { listFilledSimulatedOrdersWithDirection } from "@/lib/repositories/orders-repository";

export interface FilledLocalOrder {
  symbol: string;
  direction: "buy" | "sell";
  qty: number;
  filledAvgPrice: number;
}

export interface LocalPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
}

export interface LocalPortfolio {
  cash: number;
  /** cash + sum(cost basis of open positions) — includes realized P&L from
   * closed positions, excludes unrealized P&L on open ones (no live
   * mark-to-market in Phase 1). Used as the "equity" input to risk-limit
   * checks (e.g. max_position_pct) that need a stable reference value. */
  equity: number;
  positions: LocalPosition[];
}

/**
 * Pure — cash-only, no margin, long-only. Walks filled LOCAL SIMULATION
 * orders in chronological order, tracking remaining cash and net position
 * per symbol. This is what "buying power" means for a simulated order now
 * that no order this app places ever reaches a real broker — see the
 * Phase 1 recovery design decisions in CLAUDE.md. Trusts its input: it's
 * the caller's job (the order-validation path) to prevent a sell exceeding
 * a currently-held qty before it can ever become a filled order in the
 * first place; this function just aggregates whatever ledger it's given.
 */
export function computeLocalPortfolio(startingBalance: number, filledOrders: FilledLocalOrder[]): LocalPortfolio {
  let cash = startingBalance;
  const bySymbol = new Map<string, { qty: number; costBasis: number }>();

  for (const order of filledOrders) {
    const notional = order.qty * order.filledAvgPrice;
    const existing = bySymbol.get(order.symbol) ?? { qty: 0, costBasis: 0 };

    if (order.direction === "buy") {
      cash -= notional;
      bySymbol.set(order.symbol, { qty: existing.qty + order.qty, costBasis: existing.costBasis + notional });
    } else {
      cash += notional;
      const avgEntry = existing.qty > 0 ? existing.costBasis / existing.qty : 0;
      const remainingQty = Math.max(existing.qty - order.qty, 0);
      bySymbol.set(order.symbol, { qty: remainingQty, costBasis: remainingQty * avgEntry });
    }
  }

  const positions: LocalPosition[] = Array.from(bySymbol.entries())
    .filter(([, p]) => p.qty > 0)
    .map(([symbol, p]) => ({ symbol, qty: p.qty, avgEntryPrice: p.costBasis / p.qty }));

  const equity = cash + positions.reduce((sum, p) => sum + p.qty * p.avgEntryPrice, 0);

  return { cash, equity, positions };
}

/** Fetches the filled local order ledger and computes the portfolio in one
 * call — what dashboard/API-route callers actually use. */
export async function getLocalPortfolio(
  supabase: SupabaseClient<Database>,
  params: { accountId: string; startingBalance: number }
): Promise<LocalPortfolio> {
  const filledOrders = await listFilledSimulatedOrdersWithDirection(supabase, params.accountId);
  return computeLocalPortfolio(params.startingBalance, filledOrders);
}
