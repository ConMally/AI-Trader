import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// For use inside Server Components, Route Handlers, and Server Actions only.
// Creates a new client per request (Fluid-compute / edge safe) rather than a
// shared singleton, and runs as the calling user — Row Level Security still
// applies. For RLS-bypassing server-only work (Phase 1+ scheduled jobs), use
// a service-role client built from getSupabaseServiceRoleKey() instead, and
// keep that entirely out of any request path a browser can reach.
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies can't be
          // set. Safe to ignore once middleware/proxy is refreshing the
          // session on every request (Phase 0 does not yet wire this up —
          // see docs/ROADMAP.md).
        }
      },
    },
  });
}
