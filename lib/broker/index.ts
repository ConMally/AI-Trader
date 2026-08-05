import "server-only";
import { BrokerConfigError } from "./errors";
import { ReadOnlyAlpacaClient } from "./alpaca/client";
import { AlpacaPaperAdapter } from "./alpaca/paper-adapter";
import type { ReadOnlyBrokerAdapter } from "./types";

const REQUIRED_PAPER_BASE_URL_SUBSTRING = "paper-api.alpaca.markets";

/**
 * The ONLY function in this codebase that reads ALPACA_PAPER_* env vars.
 * There is no getLiveBrokerAdapter in this phase — that code path simply
 * does not exist yet (Phase 7), so this function cannot read ALPACA_LIVE_*
 * even by mistake; there's nothing here that names those variables.
 *
 * Fails closed: throws BrokerConfigError (never returns a half-configured
 * adapter) if any credential is missing, or if the base URL doesn't look
 * like Alpaca's paper endpoint — this specifically catches someone
 * accidentally pointing ALPACA_PAPER_BASE_URL at the live API by mistake.
 *
 * Returns a READ-ONLY adapter — market data, calendar, account/position/
 * order display only. There is no function anywhere in this codebase that
 * returns anything capable of placing an order against Alpaca.
 */
export function getPaperBrokerAdapter(): ReadOnlyBrokerAdapter {
  const keyId = process.env.ALPACA_PAPER_API_KEY_ID;
  const secretKey = process.env.ALPACA_PAPER_API_SECRET_KEY;
  const baseUrl = process.env.ALPACA_PAPER_BASE_URL;

  if (!keyId || !secretKey || !baseUrl) {
    throw new BrokerConfigError(
      "Missing ALPACA_PAPER_API_KEY_ID, ALPACA_PAPER_API_SECRET_KEY, or ALPACA_PAPER_BASE_URL. " +
        "Copy .env.example to .env.local and fill in your Alpaca paper credentials (see docs/SUPABASE.md / README)."
    );
  }

  if (!baseUrl.includes(REQUIRED_PAPER_BASE_URL_SUBSTRING)) {
    throw new BrokerConfigError(
      `ALPACA_PAPER_BASE_URL does not look like Alpaca's paper trading endpoint ` +
        `(expected it to contain "${REQUIRED_PAPER_BASE_URL_SUBSTRING}"). Refusing to construct a broker ` +
        "adapter rather than risk pointing paper-mode code at a live endpoint."
    );
  }

  const client = new ReadOnlyAlpacaClient({ keyId, secretKey, tradingBaseUrl: baseUrl });
  return new AlpacaPaperAdapter(client);
}
