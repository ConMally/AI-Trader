import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ReadOnlyBrokerAdapter, BrokerQuote } from "@/lib/broker/types";
import type { QuoteValidationResult } from "./types";

const DEFAULT_FUTURE_TOLERANCE_SECONDS = 5;

/**
 * Pure — no DB or broker access. Rejects a quote that is missing,
 * malformed, crossed (bid > ask), future-dated beyond a small clock-skew
 * tolerance, or older than `stalenessSeconds`. This is the single source of
 * truth for "is this quote usable" — both the market-data display path and
 * the order-validation path call this same function so they can never
 * disagree about what counts as a stale/bad quote.
 */
export function validateQuote(
  quote: BrokerQuote,
  options: { stalenessSeconds: number; now?: Date; futureToleranceSeconds?: number }
): QuoteValidationResult {
  const now = options.now ?? new Date();
  const futureToleranceSeconds = options.futureToleranceSeconds ?? DEFAULT_FUTURE_TOLERANCE_SECONDS;

  if (quote.bidPrice === null || quote.askPrice === null) {
    return { status: "missing", notes: "bid or ask price is missing" };
  }

  if (
    !Number.isFinite(quote.bidPrice) ||
    !Number.isFinite(quote.askPrice) ||
    quote.bidPrice <= 0 ||
    quote.askPrice <= 0
  ) {
    return { status: "malformed", notes: `bid/ask is not a positive finite number (bid=${quote.bidPrice}, ask=${quote.askPrice})` };
  }

  if (quote.bidPrice > quote.askPrice) {
    return { status: "crossed", notes: `bid ${quote.bidPrice} > ask ${quote.askPrice}` };
  }

  const sourceTime = new Date(quote.sourceTimestamp);
  if (Number.isNaN(sourceTime.getTime())) {
    return { status: "malformed", notes: `quote timestamp is not a valid date: ${quote.sourceTimestamp}` };
  }

  const ageMs = now.getTime() - sourceTime.getTime();

  if (ageMs < -futureToleranceSeconds * 1000) {
    return { status: "future_dated", notes: `quote timestamp is ${Math.abs(ageMs)}ms in the future` };
  }

  if (ageMs > options.stalenessSeconds * 1000) {
    return { status: "stale", notes: `quote is ${ageMs}ms old, exceeds the ${options.stalenessSeconds}s threshold` };
  }

  return { status: "ok" };
}

export interface GetQuoteResult {
  quote: BrokerQuote;
  validation: QuoteValidationResult;
}

/**
 * Fetches the latest quote from the broker, validates it, and logs the
 * attempt (including rejections) to market_data_snapshots for
 * traceability. Does NOT check universe membership — call
 * assertSymbolInUniverse first; quote freshness and universe membership
 * are independent checks and callers should not conflate them.
 */
export async function getQuote(
  broker: ReadOnlyBrokerAdapter,
  supabase: SupabaseClient<Database>,
  params: { userId: string; accountId: string; symbol: string; stalenessSeconds: number }
): Promise<GetQuoteResult> {
  const quote = await broker.getLatestQuote(params.symbol);
  const validation = validateQuote(quote, { stalenessSeconds: params.stalenessSeconds });

  const { error } = await supabase.from("market_data_snapshots").insert({
    user_id: params.userId,
    account_id: params.accountId,
    symbol: params.symbol,
    provider: quote.provider,
    feed: quote.feed,
    bid_price: quote.bidPrice,
    ask_price: quote.askPrice,
    last_price: quote.lastPrice,
    source_timestamp: quote.sourceTimestamp,
    validation_status: validation.status,
    validation_notes: validation.notes ?? null,
    raw: quote as unknown as Record<string, unknown>,
  });

  if (error) {
    throw new Error(`Failed to log market_data_snapshots row: ${error.message}`);
  }

  return { quote, validation };
}
