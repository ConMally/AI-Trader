import { z } from "zod";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedAccount } from "@/lib/api/auth";
import { respondError, respondOk, respondRateLimited, respondValidationIssues } from "@/lib/api/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getPaperBrokerAdapter } from "@/lib/broker";
import { assertSymbolInUniverse } from "@/lib/market-data/universe";
import { getQuote } from "@/lib/market-data/quotes";
import { getRiskLimits } from "@/lib/repositories/accounts-repository";
import { getProposalByClientOrderId } from "@/lib/repositories/proposals-repository";
import { isMarketOpenNow } from "@/lib/repositories/market-calendar-repository";
import { getLocalPortfolio } from "@/lib/local-broker/local-portfolio";
import { previewFill } from "@/lib/local-broker/local-order-recorder";
import { validateOrder } from "@/lib/validator/proposal-validator";
import { confirmManualOrder } from "@/lib/order-executor/confirm";

// A confirmation is only valid to act on for a short window — long enough
// for a human to read the confirmation screen and click, short enough that
// a stale confirmation can't be replayed much later against a moved market.
const CONFIRMATION_WINDOW_MS = 2 * 60 * 1000;

const ConfirmSchema = z
  .object({
    clientOrderId: z.string().min(1),
    symbol: z.string().min(1).max(10),
    side: z.enum(["buy", "sell"]),
    type: z.enum(["market", "limit"]),
    qty: z.number().int().positive(),
    limitPrice: z.number().positive().optional(),
  })
  .refine((data) => data.type !== "limit" || data.limitPrice !== undefined, {
    message: "limitPrice is required for a limit order.",
    path: ["limitPrice"],
  });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { userId, accountId, account } = await requireAuthenticatedAccount(supabase);

    const rateLimit = checkRateLimit(`${userId}:orders-confirm`, RATE_LIMITS.orderConfirm);
    if (!rateLimit.allowed) return respondRateLimited(rateLimit.retryAfterSeconds);

    const body = await request.json().catch(() => null);
    const parsed = ConfirmSchema.safeParse(body);
    if (!parsed.success) {
      return respondValidationIssues(parsed.error.issues.map((i) => ({ code: i.path.join(".") || "invalid", message: i.message })));
    }
    const input = parsed.data;
    const symbol = input.symbol.toUpperCase();

    await assertSymbolInUniverse(supabase, { userId, symbol });

    const riskLimits = await getRiskLimits(supabase, accountId);
    const broker = getPaperBrokerAdapter();
    const { quote, validation: quoteValidation } = await getQuote(broker, supabase, {
      userId,
      accountId,
      symbol,
      stalenessSeconds: riskLimits.quote_staleness_seconds,
    });

    const [existingProposal, portfolio, marketOpen] = await Promise.all([
      getProposalByClientOrderId(supabase, input.clientOrderId),
      getLocalPortfolio(supabase, { accountId, startingBalance: account.starting_balance }),
      isMarketOpenNow(supabase),
    ]);

    const validationResult = validateOrder({
      account,
      riskLimits,
      order: { symbol, side: input.side, type: input.type, qty: input.qty, limitPrice: input.limitPrice },
      quoteBidPrice: quote.bidPrice,
      quoteAskPrice: quote.askPrice,
      quoteValidation,
      marketOpen,
      existingProposal,
      openPositionCount: portfolio.positions.length,
      latestEquity: portfolio.equity,
      latestBuyingPower: portfolio.cash,
    });

    if (!validationResult.ok) {
      return respondValidationIssues(validationResult.issues);
    }

    if (input.side === "sell") {
      const held = portfolio.positions.find((p) => p.symbol === symbol)?.qty ?? 0;
      if (input.qty > held) {
        return respondValidationIssues([
          { code: "exceeds_held_quantity", message: `Only ${held} simulated share(s) of ${symbol} are held; cannot sell ${input.qty}.` },
        ]);
      }
    }

    const entryPrice = input.type === "limit" ? input.limitPrice! : validationResult.estimatedPrice;
    const expiresAt = new Date(Date.now() + CONFIRMATION_WINDOW_MS).toISOString();

    const proposal = await confirmManualOrder(supabase, {
      user_id: userId,
      account_id: accountId,
      symbol,
      direction: input.side,
      qty: input.qty,
      entry_price: entryPrice,
      order_type: input.type,
      client_order_id: input.clientOrderId,
      expires_at: expiresAt,
    });

    // Preview uses the EXACT same fill calculation execute will use — see
    // lib/local-broker/local-order-recorder.ts's previewFill doc comment.
    const preview = previewFill(
      { clientOrderId: input.clientOrderId, symbol, side: input.side, type: input.type, qty: input.qty, limitPrice: input.limitPrice },
      { bidPrice: quote.bidPrice, askPrice: quote.askPrice, lastPrice: quote.lastPrice, sourceTimestamp: quote.sourceTimestamp }
    );

    const estimatedCost = (preview.filledAvgPrice ?? validationResult.estimatedPrice) * input.qty;
    const localCashRemainingAfter = input.side === "buy" ? portfolio.cash - estimatedCost : portfolio.cash + estimatedCost;

    return respondOk({
      proposalId: proposal.id,
      referenceQuote: { bidPrice: quote.bidPrice, askPrice: quote.askPrice, sourceTimestamp: quote.sourceTimestamp },
      fillModel: preview.metadata.fillModel,
      estimatedFill: { price: preview.filledAvgPrice, status: preview.status },
      allocationImpact: {
        estimatedCost,
        localCashRemainingAfter,
        pctOfAllocation: estimatedCost / account.starting_balance,
      },
      expiresAt,
    });
  } catch (error) {
    return respondError(error);
  }
}
