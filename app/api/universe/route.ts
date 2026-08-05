import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedAccount } from "@/lib/api/auth";
import { respondError, respondOk, respondRateLimited } from "@/lib/api/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { ensureDefaultUniverse } from "@/lib/market-data/universe";
import { listUniverse } from "@/lib/repositories/universe-repository";

// Not one of the seven routes named in the Phase 1 plan, but the order
// ticket has no way to know which symbols are selectable without it —
// added as a small, obvious necessity rather than hardcoding the universe
// client-side.
export async function GET() {
  try {
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedAccount(supabase);

    const rateLimit = checkRateLimit(`${userId}:universe`, RATE_LIMITS.read);
    if (!rateLimit.allowed) return respondRateLimited(rateLimit.retryAfterSeconds);

    await ensureDefaultUniverse(supabase, userId);
    const universe = await listUniverse(supabase, userId);

    return respondOk({ symbols: universe.filter((u) => u.enabled).map((u) => u.symbol) });
  } catch (error) {
    return respondError(error);
  }
}
