import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedAccount } from "@/lib/api/auth";
import { respondError, respondOk, respondRateLimited } from "@/lib/api/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getPaperBrokerAdapter } from "@/lib/broker";
import { getRecentBrokerOrders } from "@/lib/account-sync/sync";

// Live pass-through only — never persisted (see lib/account-sync/README.md).
export async function GET() {
  try {
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedAccount(supabase);

    const rateLimit = checkRateLimit(`${userId}:broker-orders`, RATE_LIMITS.read);
    if (!rateLimit.allowed) return respondRateLimited(rateLimit.retryAfterSeconds);

    const broker = getPaperBrokerAdapter();
    const orders = await getRecentBrokerOrders(broker, { limit: 50 });

    return respondOk({ brokerOrders: orders });
  } catch (error) {
    return respondError(error);
  }
}
