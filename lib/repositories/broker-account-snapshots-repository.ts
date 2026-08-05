import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { BrokerAccountSnapshot } from "@/lib/broker/types";

export async function insertSnapshot(
  supabase: SupabaseClient<Database>,
  params: { userId: string; accountId: string; snapshot: BrokerAccountSnapshot }
) {
  const { userId, accountId, snapshot } = params;
  const { error } = await supabase.from("broker_account_snapshots").insert({
    user_id: userId,
    account_id: accountId,
    broker_account_id: snapshot.brokerAccountId,
    equity: snapshot.equity,
    cash: snapshot.cash,
    buying_power: snapshot.buyingPower,
    status: snapshot.status,
    raw: snapshot as unknown as Record<string, unknown>,
  });

  if (error) throw new Error(`Failed to insert broker account snapshot: ${error.message}`);
}

export async function getLatestSnapshot(supabase: SupabaseClient<Database>, accountId: string) {
  const { data, error } = await supabase
    .from("broker_account_snapshots")
    .select("*")
    .eq("account_id", accountId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load latest broker account snapshot: ${error.message}`);
  return data;
}
