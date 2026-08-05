import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedAccount } from "@/lib/api/auth";
import { respondError, respondOk, respondRateLimited } from "@/lib/api/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getPaperBrokerAdapter } from "@/lib/broker";
import { syncPositions } from "@/lib/account-sync/sync";
import { getLocalPortfolio } from "@/lib/local-broker/local-portfolio";

export async function GET() {
  try {
    const supabase = await createClient();
    const { userId, accountId, account } = await requireAuthenticatedAccount(supabase);

    const rateLimit = checkRateLimit(`${userId}:positions`, RATE_LIMITS.read);
    if (!rateLimit.allowed) return respondRateLimited(rateLimit.retryAfterSeconds);

    const broker = getPaperBrokerAdapter();

    // Two distinct arrays, never merged: brokerPositions is Alpaca's real
    // (read-only) paper-account holdings; localSimulatedPositions is
    // derived entirely from this app's own filled LOCAL SIMULATION orders.
    const brokerPositions = await syncPositions({ supabase, broker, userId, accountId });
    const portfolio = await getLocalPortfolio(supabase, { accountId, startingBalance: account.starting_balance });

    return respondOk({
      brokerPositions,
      localSimulatedPositions: portfolio.positions,
    });
  } catch (error) {
    return respondError(error);
  }
}
