// Shared env-var access for every Supabase helper. Throws only when actually
// invoked (never at module load time), so importing these helpers is always
// safe even before .env.local is filled in.

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase project's values " +
        "(see docs/SUPABASE.md)."
    );
  }

  return { url, anonKey };
}

export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// The service-role key helper deliberately does NOT live in this file — see
// lib/supabase/service-role.ts. This file (env.ts) is imported by
// client.ts, a "use client" module, so anything exported here ends up
// reachable from client bundles. Keeping the service-role key in a
// separate, "server-only"-guarded module means an accidental client import
// of it fails the build instead of silently shipping in a bundle.
