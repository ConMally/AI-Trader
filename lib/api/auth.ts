import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPaperAccount } from "@/lib/repositories/accounts-repository";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sign in required.");
    this.name = "UnauthenticatedError";
  }
}

export interface AuthenticatedContext {
  userId: string;
  accountId: string;
  account: Awaited<ReturnType<typeof getPaperAccount>>;
}

/**
 * Every route handler calls this first. `userId` always comes from the
 * session (`supabase.auth.getUser()`) — never from a request body field, so
 * a client can't claim to be someone else. `proxy.ts` already blocks
 * unauthenticated requests to `/api/*` with its own 401 at the middleware
 * layer; this is the route handler's own independent check, since it also
 * needs to know WHO is asking (proxy.ts doesn't hand that down), and
 * defense-in-depth is cheap here.
 */
export async function requireAuthenticatedAccount(supabase: SupabaseClient<Database>): Promise<AuthenticatedContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthenticatedError();
  }

  const account = await getPaperAccount(supabase, user.id);
  return { userId: user.id, accountId: account.id, account };
}
