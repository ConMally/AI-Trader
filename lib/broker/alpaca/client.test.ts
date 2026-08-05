import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadOnlyAlpacaClient } from "./client";
import { BrokerRequestError } from "../errors";

function makeClient() {
  return new ReadOnlyAlpacaClient({
    keyId: "test-key",
    secretKey: "test-secret",
    tradingBaseUrl: "https://paper-api.alpaca.markets",
  });
}

describe("ReadOnlyAlpacaClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has no post/put/patch/delete method at all — GET is the only public entry point", () => {
    const client = makeClient() as unknown as Record<string, unknown>;
    expect(client.post).toBeUndefined();
    expect(client.put).toBeUndefined();
    expect(client.patch).toBeUndefined();
    expect(client.delete).toBeUndefined();
  });

  it("sends every request as GET with the paper credentials as Alpaca auth headers", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- params needed so vi.fn infers the call-args tuple type used below
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await makeClient().get("/v2/account");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledInit?.method).toBe("GET");
    expect(String(calledUrl)).not.toContain("test-secret");
    expect(String(calledUrl)).not.toContain("test-key");
    const headers = calledInit?.headers as Record<string, string>;
    expect(headers["APCA-API-KEY-ID"]).toBe("test-key");
    expect(headers["APCA-API-SECRET-KEY"]).toBe("test-secret");
  });

  it("throws BrokerRequestError with the status and broker message on a 4xx/5xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "not found" }), { status: 404 }))
    );

    await expect(makeClient().get("/v2/account")).rejects.toMatchObject({
      name: "BrokerRequestError",
      status: 404,
      brokerMessage: "not found",
    } satisfies Partial<BrokerRequestError>);
  });

  it("throws a plain Error (not BrokerRequestError) on a network-level failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );

    await expect(makeClient().get("/v2/account")).rejects.toThrow(/Network error/);
  });

  it("routes market-data requests to data.alpaca.markets, not the trading base URL", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- params needed so vi.fn infers the call-args tuple type used below
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await makeClient().get("/v2/stocks/AAPL/quotes/latest", { target: "data" });

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain("data.alpaca.markets");
  });
});
