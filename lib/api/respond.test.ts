import { describe, expect, it, vi } from "vitest";
import { respondError, respondOk, respondRateLimited, respondUnauthorized, respondValidationIssues } from "./respond";
import { SymbolNotInUniverseError } from "@/lib/market-data/universe";
import { DuplicateSubmissionError } from "@/lib/order-executor/confirm";

describe("respondOk", () => {
  it("wraps data in the {ok, data} envelope", async () => {
    const res = respondOk({ hello: "world" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { hello: "world" } });
  });
});

describe("respondValidationIssues", () => {
  it("returns 400 with the issues array", async () => {
    const res = respondValidationIssues([{ code: "invalid_quantity", message: "bad qty" }]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.issues).toHaveLength(1);
  });
});

describe("respondUnauthorized", () => {
  it("returns 401", async () => {
    expect(respondUnauthorized().status).toBe(401);
  });
});

describe("respondRateLimited", () => {
  it("returns 429 with a Retry-After header when provided", () => {
    const res = respondRateLimited(30);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });
});

describe("respondError", () => {
  it("maps SymbolNotInUniverseError to a safe 400 with its own message", async () => {
    const res = respondError(new SymbolNotInUniverseError("ZZZZ"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("ZZZZ");
  });

  it("maps DuplicateSubmissionError to a safe 409", async () => {
    const res = respondError(new DuplicateSubmissionError("c1"));
    expect(res.status).toBe(409);
  });

  it("never leaks an unexpected error's message — logs server-side, returns a generic 500", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = respondError(new Error("Supabase connection string: postgres://user:hunter2@host/db"));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("hunter2");
    expect(body.error).toBe("Something went wrong. Please try again.");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
