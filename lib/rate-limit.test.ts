import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production"); // rate limiting is disabled in "development"
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows requests up to the configured max within the window", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    const key = `test-key-${crypto.randomUUID()}`;
    const options = { windowMs: 60_000, maxRequests: 3 };

    expect(checkRateLimit(key, options).allowed).toBe(true);
    expect(checkRateLimit(key, options).allowed).toBe(true);
    expect(checkRateLimit(key, options).allowed).toBe(true);
  });

  it("blocks once the max is exceeded within the window, with a retryAfterSeconds", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    const key = `test-key-${crypto.randomUUID()}`;
    const options = { windowMs: 60_000, maxRequests: 2 };

    checkRateLimit(key, options);
    checkRateLimit(key, options);
    const blocked = checkRateLimit(key, options);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows again once the window has elapsed", async () => {
    vi.useFakeTimers();
    const { checkRateLimit } = await import("./rate-limit");
    const key = `test-key-${crypto.randomUUID()}`;
    const options = { windowMs: 1000, maxRequests: 1 };

    expect(checkRateLimit(key, options).allowed).toBe(true);
    expect(checkRateLimit(key, options).allowed).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(checkRateLimit(key, options).allowed).toBe(true);

    vi.useRealTimers();
  });

  it("keeps separate buckets for different keys", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    const options = { windowMs: 60_000, maxRequests: 1 };
    const keyA = `a-${crypto.randomUUID()}`;
    const keyB = `b-${crypto.randomUUID()}`;

    expect(checkRateLimit(keyA, options).allowed).toBe(true);
    expect(checkRateLimit(keyA, options).allowed).toBe(false);
    expect(checkRateLimit(keyB, options).allowed).toBe(true);
  });

  it("is disabled entirely in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { checkRateLimit } = await import("./rate-limit");
    const key = `dev-${crypto.randomUUID()}`;
    const options = { windowMs: 60_000, maxRequests: 1 };

    expect(checkRateLimit(key, options).allowed).toBe(true);
    expect(checkRateLimit(key, options).allowed).toBe(true);
    expect(checkRateLimit(key, options).allowed).toBe(true);
  });
});
