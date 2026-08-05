import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function getPaperAccount(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", "paper")
    .single();

  if (error) throw new Error(`Failed to load paper account: ${error.message}`);
  return data;
}

export async function setKillSwitch(supabase: SupabaseClient<Database>, accountId: string, enabled: boolean) {
  const { error } = await supabase.from("accounts").update({ kill_switch_enabled: enabled }).eq("id", accountId);
  if (error) throw new Error(`Failed to update kill switch: ${error.message}`);
}

export async function getRiskLimits(supabase: SupabaseClient<Database>, accountId: string) {
  const { data, error } = await supabase.from("risk_limits").select("*").eq("account_id", accountId).single();
  if (error) throw new Error(`Failed to load risk limits: ${error.message}`);
  return data;
}
