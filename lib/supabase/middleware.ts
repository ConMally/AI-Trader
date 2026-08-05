import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { hasSupabaseEnv } from "./env";

// Refreshes the Supabase auth session cookie on every request — required
// because Server Components can't write cookies themselves — and returns
// the resolved user so proxy.ts can make route-protection decisions without
// a second round-trip.
//
// If no Supabase project is configured at all, this no-ops immediately
// (user: null) so the app fails closed to the login page rather than
// throwing on every request.
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });

  if (!hasSupabaseEnv()) {
    return { response, user: null };
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Touching auth.getUser() triggers a token refresh when the current
  // session is close to expiring, and re-validates against Supabase rather
  // than trusting whatever the cookie currently says.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
