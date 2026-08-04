import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// The `server-only` import above makes any accidental import of this file
// from a Client Component (or anything in its module graph) fail at build
// time, rather than silently bundling a service-role key into client JS.
// This key bypasses Row Level Security entirely — it must never reach the
// browser. Used starting Phase 1 by the scheduled Edge Functions and admin
// scripts that need to write RLS-protected tables (e.g. market_calendar) as
// no particular user; not called by anything in Phase 0.

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. This is required for server-only, RLS-bypassing " +
        "operations (see docs/SUPABASE.md) and must never be exposed to the client."
    );
  }

  return key;
}

// Convenience factory for the handful of server-only jobs that need to
// bypass RLS entirely (e.g. writing the shared market_calendar table).
// Do not call this from any code path a browser request can reach.
export function createServiceRoleClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
