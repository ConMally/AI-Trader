import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Read path only — lib/market-data/quotes.ts writes market_data_snapshots
 * directly as part of fetching a quote; this is for UI/history display. */
export async function listRecentSnapshots(
  supabase: SupabaseClient<Database>,
  params: { accountId: string; symbol: string; limit?: number }
) {
  const { data, error } = await supabase
    .from("market_data_snapshots")
    .select("*")
    .eq("account_id", params.accountId)
    .eq("symbol", params.symbol)
    .order("retrieved_at", { ascending: false })
    .limit(params.limit ?? 20);

  if (error) throw new Error(`Failed to list market data snapshots: ${error.message}`);
  return data;
}
