import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function listUniverse(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("universe")
    .select("*")
    .eq("user_id", userId)
    .order("symbol", { ascending: true });

  if (error) throw new Error(`Failed to list universe: ${error.message}`);
  return data;
}
