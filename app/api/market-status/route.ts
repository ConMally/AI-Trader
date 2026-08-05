import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedAccount } from "@/lib/api/auth";
import { respondError, respondOk, respondRateLimited } from "@/lib/api/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getCurrentTradingSessionNow, getNextMarketOpenFromNow, isMarketOpenNow } from "@/lib/repositories/market-calendar-repository";

export async function GET() {
  try {
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedAccount(supabase);

    const rateLimit = checkRateLimit(`${userId}:market-status`, RATE_LIMITS.read);
    if (!rateLimit.allowed) return respondRateLimited(rateLimit.retryAfterSeconds);

    const [open, session, nextOpen] = await Promise.all([
      isMarketOpenNow(supabase),
      getCurrentTradingSessionNow(supabase),
      getNextMarketOpenFromNow(supabase),
    ]);

    return respondOk({ open, session, nextOpen });
  } catch (error) {
    return respondError(error);
  }
}
