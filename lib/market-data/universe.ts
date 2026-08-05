import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { DEFAULT_UNIVERSE } from "./default-universe";

export class SymbolNotInUniverseError extends Error {
  constructor(symbol: string) {
    super(`${symbol} is not in this account's configured universe — the scanner/order flow only ever touches an explicit allow-list, never "the whole market".`);
    this.name = "SymbolNotInUniverseError";
  }
}

/** Throws SymbolNotInUniverseError if `symbol` is not an enabled row in the
 * caller's universe table. Every quote fetch and every order validation
 * must call this before doing anything else with a user-supplied symbol. */
export async function assertSymbolInUniverse(
  supabase: SupabaseClient<Database>,
  params: { userId: string; symbol: string }
): Promise<void> {
  const { data, error } = await supabase
    .from("universe")
    .select("id")
    .eq("user_id", params.userId)
    .eq("symbol", params.symbol)
    .eq("enabled", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check universe membership: ${error.message}`);
  }

  if (!data) {
    throw new SymbolNotInUniverseError(params.symbol);
  }
}

/**
 * Idempotent: seeds DEFAULT_UNIVERSE for a user only if their universe
 * table is currently empty, so calling this repeatedly (e.g. on every
 * dashboard load) never duplicates or resets a universe the user has since
 * customized.
 */
export async function ensureDefaultUniverse(supabase: SupabaseClient<Database>, userId: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from("universe")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) {
    throw new Error(`Failed to check existing universe rows: ${countError.message}`);
  }

  if (count && count > 0) return;

  const { error: insertError } = await supabase
    .from("universe")
    .insert(DEFAULT_UNIVERSE.map((symbol) => ({ user_id: userId, symbol, enabled: true })));

  if (insertError) {
    throw new Error(`Failed to seed default universe: ${insertError.message}`);
  }
}
