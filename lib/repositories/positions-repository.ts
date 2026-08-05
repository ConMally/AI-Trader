import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { BrokerPosition } from "@/lib/broker/types";

export async function upsertPosition(
  supabase: SupabaseClient<Database>,
  params: { userId: string; accountId: string; position: BrokerPosition }
) {
  const { userId, accountId, position } = params;
  const { error } = await supabase.from("positions").upsert(
    {
      user_id: userId,
      account_id: accountId,
      symbol: position.symbol,
      qty: position.qty,
      avg_entry_price: position.avgEntryPrice,
      market_value: position.marketValue,
      unrealized_pl: position.unrealizedPl,
    },
    { onConflict: "account_id,symbol" }
  );

  if (error) throw new Error(`Failed to upsert position ${position.symbol}: ${error.message}`);
}

/** Zeroes out a position no longer reported by the broker, rather than
 * deleting the row — preserves the fact that this symbol was once held. */
export async function zeroOutPosition(supabase: SupabaseClient<Database>, accountId: string, symbol: string) {
  const { error } = await supabase
    .from("positions")
    .update({ qty: 0, market_value: 0, unrealized_pl: 0 })
    .eq("account_id", accountId)
    .eq("symbol", symbol);

  if (error) throw new Error(`Failed to zero out position ${symbol}: ${error.message}`);
}

export async function listPositions(supabase: SupabaseClient<Database>, accountId: string) {
  const { data, error } = await supabase
    .from("positions")
    .select("*")
    .eq("account_id", accountId)
    .order("symbol", { ascending: true });

  if (error) throw new Error(`Failed to list positions: ${error.message}`);
  return data;
}
