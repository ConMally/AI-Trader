import { BrokerRequestError } from "../errors";

// Alpaca's market-data API lives on a separate host from the trading API,
// and (unlike the trading API) is not itself split into paper/live URLs —
// the same data endpoint and the same key pair serve both trading modes.
// Not configurable via env because there is nothing account-mode-specific
// about it to get wrong.
const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets";

export interface AlpacaClientConfig {
  keyId: string;
  secretKey: string;
  /** Trading API base — this IS mode-specific (paper vs live) and is passed
   * in by the caller (lib/broker/index.ts), never read from process.env by
   * this class itself. */
  tradingBaseUrl: string;
}

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  /** Market-data requests hit ALPACA_DATA_BASE_URL instead of the trading
   * base URL. */
  target?: "trading" | "data";
}

/**
 * Minimal, dependency-free, READ-ONLY REST client for Alpaca's Trading +
 * Market Data APIs. There is no `post`/`put`/`patch`/`delete` method on
 * this class — it cannot construct a write request at all. `get()` is the
 * only public entry point, and the private `request()` it funnels through
 * asserts `method === "GET"` before ever calling `fetch`, so even a future
 * edit that tries to reintroduce a write call here fails immediately and
 * loudly rather than silently reaching Alpaca.
 *
 * Credentials are constructor-injected rather than read from process.env
 * internally, and every response shape this class returns is raw Alpaca
 * JSON — callers (lib/broker/alpaca/*-adapter.ts) must run it through
 * mapper.ts before it can leave lib/broker/alpaca/.
 */
export class ReadOnlyAlpacaClient {
  constructor(private readonly config: AlpacaClientConfig) {}

  private headers(): Record<string, string> {
    return {
      "APCA-API-KEY-ID": this.config.keyId,
      "APCA-API-SECRET-KEY": this.config.secretKey,
    };
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  private async request<T>(method: "GET", path: string, options: RequestOptions): Promise<T> {
    // Redundant with this method's own type signature (only "GET" is
    // accepted), but kept as an explicit runtime assertion rather than
    // relying on the type system alone — this is the one place in the
    // codebase this guarantee has to hold no matter what.
    if (method !== "GET") {
      throw new Error(`ReadOnlyAlpacaClient refuses to send a ${method} request — GET only.`);
    }

    const base = options.target === "data" ? ALPACA_DATA_BASE_URL : this.config.tradingBaseUrl;
    const url = new URL(path, base);

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await fetch(url, { method: "GET", headers: this.headers() });
    } catch (cause) {
      throw new Error(`Network error calling Alpaca (GET ${path}): ${String(cause)}`);
    }

    if (!response.ok) {
      let brokerMessage: string | undefined;
      try {
        const errorBody = (await response.json()) as { message?: string };
        brokerMessage = errorBody.message;
      } catch {
        // Non-JSON error body — brokerMessage stays undefined, status code
        // alone is still informative.
      }

      throw new BrokerRequestError(`Alpaca request failed: GET ${path} -> ${response.status}`, response.status, brokerMessage);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
