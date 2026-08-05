import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const updateSession = vi.fn();
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (...args: unknown[]) => updateSession(...args),
}));

const { proxy } = await import("./proxy");

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("proxy (route protection)", () => {
  it("redirects an unauthenticated page request to /login, preserving the original path", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const res = await proxy(makeRequest("/dashboard"));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain("/login?redirectTo=%2Fdashboard");
  });

  it("returns a 401 JSON body for an unauthenticated API request — never a redirect", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const res = await proxy(makeRequest("/api/positions"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("never derives the user from the request itself — only from updateSession's result", async () => {
    // Even a request carrying an arbitrary Authorization-looking header must
    // still be treated as unauthenticated unless updateSession says so —
    // proxy() has no code path that inspects headers/cookies on its own.
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });
    const request = makeRequest("/dashboard");
    request.headers.set("x-user-id", "someone-elses-id");

    const res = await proxy(request);

    expect(res.headers.get("location")).toContain("/login");
  });

  it("allows unauthenticated access to /login and /signup", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const loginRes = await proxy(makeRequest("/login"));
    const signupRes = await proxy(makeRequest("/signup"));

    expect(loginRes.headers.get("location")).toBeNull();
    expect(signupRes.headers.get("location")).toBeNull();
  });

  it("allows unauthenticated access to the public landing page (/)", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const res = await proxy(makeRequest("/"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("still redirects an unauthenticated request to /dashboard, unaffected by / being public", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const res = await proxy(makeRequest("/dashboard"));

    expect(res.headers.get("location")).toContain("/login?redirectTo=%2Fdashboard");
  });

  it("still redirects an unauthenticated request to /orders/new", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const res = await proxy(makeRequest("/orders/new"));

    expect(res.headers.get("location")).toContain("/login?redirectTo=%2Forders%2Fnew");
  });

  it("redirects an already-authenticated visitor away from /login to /dashboard", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: { id: "u1" } });

    const res = await proxy(makeRequest("/login"));

    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("allows an authenticated visitor to view / — unlike /login and /signup, it does not bounce them to /dashboard", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: { id: "u1" } });

    const res = await proxy(makeRequest("/"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes an authenticated request through to a protected page", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: { id: "u1" } });

    const res = await proxy(makeRequest("/dashboard"));

    expect(res.headers.get("location")).toBeNull();
  });
});
