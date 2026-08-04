"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// For use inside Client Components only. Do not call Supabase directly from
// visual components once repositories exist (Phase 1+) — go through a
// repository implementation instead, matching the pattern in
// lib/repositories/README.md.
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
