import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaperBrokerAdapter } from "./index";
import { BrokerConfigError } from "./errors";

const ENV_KEYS = [
  "ALPACA_PAPER_API_KEY_ID",
  "ALPACA_PAPER_API_SECRET_KEY",
  "ALPACA_PAPER_BASE_URL",
  "ALPACA_LIVE_API_KEY_ID",
  "ALPACA_LIVE_API_SECRET_KEY",
  "ALPACA_LIVE_BASE_URL",
] as const;

function clearAlpacaEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("getPaperBrokerAdapter", () => {
  afterEach(() => {
    clearAlpacaEnv();
    vi.restoreAllMocks();
  });

  it("fails closed when ALPACA_PAPER_* vars are entirely missing", () => {
    clearAlpacaEnv();
    expect(() => getPaperBrokerAdapter()).toThrow(BrokerConfigError);
  });

  it("fails closed when only some ALPACA_PAPER_* vars are set", () => {
    clearAlpacaEnv();
    process.env.ALPACA_PAPER_API_KEY_ID = "key";
    // secret and base URL intentionally left unset
    expect(() => getPaperBrokerAdapter()).toThrow(BrokerConfigError);
  });

  it("fails closed when ALPACA_PAPER_BASE_URL does not look like the paper endpoint", () => {
    clearAlpacaEnv();
    process.env.ALPACA_PAPER_API_KEY_ID = "key";
    process.env.ALPACA_PAPER_API_SECRET_KEY = "secret";
    process.env.ALPACA_PAPER_BASE_URL = "https://api.alpaca.markets"; // the LIVE url, no "paper-api"
    expect(() => getPaperBrokerAdapter()).toThrow(BrokerConfigError);
  });

  it("never reads ALPACA_LIVE_* — succeeds using only ALPACA_PAPER_* even if LIVE vars are also present", () => {
    clearAlpacaEnv();
    process.env.ALPACA_PAPER_API_KEY_ID = "paper-key";
    process.env.ALPACA_PAPER_API_SECRET_KEY = "paper-secret";
    process.env.ALPACA_PAPER_BASE_URL = "https://paper-api.alpaca.markets";
    process.env.ALPACA_LIVE_API_KEY_ID = "live-key";
    process.env.ALPACA_LIVE_API_SECRET_KEY = "live-secret";
    process.env.ALPACA_LIVE_BASE_URL = "https://api.alpaca.markets";

    const adapter = getPaperBrokerAdapter();
    expect(adapter.mode).toBe("paper");
  });

  it("still fails closed when only ALPACA_LIVE_* vars are set (no fallback to live)", () => {
    clearAlpacaEnv();
    process.env.ALPACA_LIVE_API_KEY_ID = "live-key";
    process.env.ALPACA_LIVE_API_SECRET_KEY = "live-secret";
    process.env.ALPACA_LIVE_BASE_URL = "https://api.alpaca.markets";

    expect(() => getPaperBrokerAdapter()).toThrow(BrokerConfigError);
  });
});
