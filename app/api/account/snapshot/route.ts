import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedAccount } from "@/lib/api/auth";
import { respondError, respondOk, respondRateLimited } from "@/lib/api/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getPaperBrokerAdapter } from "@/lib/broker";
import { syncAccountSnapshot } from "@/lib/account-sync/sync";
import { getLocalPortfolio } from "@/lib/local-broker/local-portfolio";

export async function GET() {
  try {
    const supabase = await createClient();
    const { userId, accountId, account } = await requireAuthenticatedAccount(supabase);

    const rateLimit = checkRateLimit(`${userId}:account-snapshot`, RATE_LIMITS.read);
    if (!rateLimit.allowed) return respondRateLimited(rateLimit.retryAfterSeconds);

    const broker = getPaperBrokerAdapter();
    const snapshot = await syncAccountSnapshot({ supabase, broker, userId, accountId });
    const portfolio = await getLocalPortfolio(supabase, { accountId, startingBalance: account.starting_balance });

    // Two clearly separate fields — brokerAccount (real, read-only Alpaca
    // paper data) and experimentAllocation (the $1,000 baseline + the
    // locally-computed simulated cash/equity) are never merged into one
    // number anywhere in this response.
    return respondOk({
      brokerAccount: {
        equity: snapshot.equity,
        cash: snapshot.cash,
        buyingPower: snapshot.buyingPower,
        status: snapshot.status,
        retrievedAt: snapshot.retrievedAt,
      },
      experimentAllocation: {
        startingBalance: account.starting_balance,
        localCash: portfolio.cash,
        localEquity: portfolio.equity,
      },
      killSwitchEnabled: account.kill_switch_enabled,
    });
  } catch (error) {
    return respondError(error);
  }
}
