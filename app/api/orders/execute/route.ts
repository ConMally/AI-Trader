import { z } from "zod";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedAccount } from "@/lib/api/auth";
import { respondError, respondForbidden, respondOk, respondRateLimited, respondValidationIssues } from "@/lib/api/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getPaperBrokerAdapter } from "@/lib/broker";
import { getQuote } from "@/lib/market-data/quotes";
import { getRiskLimits } from "@/lib/repositories/accounts-repository";
import { getProposalById } from "@/lib/repositories/proposals-repository";
import { isMarketOpenNow } from "@/lib/repositories/market-calendar-repository";
// Only this concrete class may be constructed for order placement — the
// route body has no field that could select anything else, and nothing
// Alpaca-backed has a matching shape to substitute (see
// lib/order-executor/type-safety.test.ts for the compile-time proof).
import { LocalOnlyOrderRecorder } from "@/lib/local-broker/local-order-recorder";
import { executeProposal } from "@/lib/order-executor/executor";

const ExecuteSchema = z.object({
  proposalId: z.string().uuid(),
  clientOrderId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { userId, accountId } = await requireAuthenticatedAccount(supabase);

    const rateLimit = checkRateLimit(`${userId}:orders-execute`, RATE_LIMITS.orderExecute);
    if (!rateLimit.allowed) return respondRateLimited(rateLimit.retryAfterSeconds);

    const body = await request.json().catch(() => null);
    const parsed = ExecuteSchema.safeParse(body);
    if (!parsed.success) {
      return respondValidationIssues(parsed.error.issues.map((i) => ({ code: i.path.join(".") || "invalid", message: i.message })));
    }

    const proposal = await getProposalById(supabase, parsed.data.proposalId);

    // Ownership check — never trust the client past this point. RLS is a
    // second, independent layer if this ever got missed.
    if (proposal.user_id !== userId || proposal.account_id !== accountId) {
      return respondForbidden();
    }
    if (proposal.client_order_id !== parsed.data.clientOrderId) {
      return respondValidationIssues([{ code: "client_order_id_mismatch", message: "clientOrderId does not match this proposal." }]);
    }

    const riskLimits = await getRiskLimits(supabase, accountId);
    const broker = getPaperBrokerAdapter();
    const { quote, validation } = await getQuote(broker, supabase, {
      userId,
      accountId,
      symbol: proposal.symbol,
      stalenessSeconds: riskLimits.quote_staleness_seconds,
    });
    const marketOpen = await isMarketOpenNow(supabase);

    const outcome = await executeProposal({
      supabase,
      recorder: new LocalOnlyOrderRecorder(),
      proposalId: proposal.id,
      quote: {
        bidPrice: quote.bidPrice,
        askPrice: quote.askPrice,
        lastPrice: quote.lastPrice,
        sourceTimestamp: quote.sourceTimestamp,
        validation,
      },
      marketOpen,
      maxSlippagePct: riskLimits.max_price_slippage_pct,
    });

    return respondOk(outcome);
  } catch (error) {
    return respondError(error);
  }
}
