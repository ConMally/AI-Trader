import { z } from "zod";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedAccount } from "@/lib/api/auth";
import { respondBadRequest, respondError, respondOk, respondRateLimited } from "@/lib/api/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getPaperBrokerAdapter } from "@/lib/broker";
import { assertSymbolInUniverse } from "@/lib/market-data/universe";
import { getQuote } from "@/lib/market-data/quotes";
import { getRiskLimits } from "@/lib/repositories/accounts-repository";

const QuerySchema = z.object({
  symbols: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((sym) => sym.trim().toUpperCase()))
    .pipe(z.array(z.string().min(1)).min(1).max(20)),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { userId, accountId } = await requireAuthenticatedAccount(supabase);

    const rateLimit = checkRateLimit(`${userId}:market-data-quotes`, RATE_LIMITS.read);
    if (!rateLimit.allowed) return respondRateLimited(rateLimit.retryAfterSeconds);

    const parsed = QuerySchema.safeParse({ symbols: request.nextUrl.searchParams.get("symbols") ?? "" });
    if (!parsed.success) return respondBadRequest("Provide a comma-separated `symbols` query parameter (1-20 symbols).");

    const riskLimits = await getRiskLimits(supabase, accountId);
    const broker = getPaperBrokerAdapter();

    const quotes = await Promise.all(
      parsed.data.symbols.map(async (symbol) => {
        await assertSymbolInUniverse(supabase, { userId, symbol });
        const { quote, validation } = await getQuote(broker, supabase, {
          userId,
          accountId,
          symbol,
          stalenessSeconds: riskLimits.quote_staleness_seconds,
        });
        return {
          symbol,
          bidPrice: quote.bidPrice,
          askPrice: quote.askPrice,
          lastPrice: quote.lastPrice,
          sourceTimestamp: quote.sourceTimestamp,
          validationStatus: validation.status,
        };
      })
    );

    return respondOk({ quotes });
  } catch (error) {
    return respondError(error);
  }
}
