import { NextResponse } from "next/server";
import { SymbolNotInUniverseError } from "@/lib/market-data/universe";
import { DuplicateSubmissionError } from "@/lib/order-executor/confirm";
import { BrokerConfigError } from "@/lib/broker/errors";
import { UnauthenticatedError } from "./auth";
import type { ValidationIssue } from "@/lib/validator/proposal-validator";

// Every route in app/api/ uses this instead of building its own
// NextResponse.json calls, so the response envelope ({ok, data}/{ok,error})
// and the "never leak an internal error message" rule are consistent
// everywhere, not something each route has to remember on its own.

export function respondOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function respondValidationIssues(issues: ValidationIssue[]) {
  return NextResponse.json({ ok: false, error: "Validation failed", issues }, { status: 400 });
}

export function respondUnauthorized() {
  return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
}

export function respondRateLimited(retryAfterSeconds?: number) {
  const response = NextResponse.json({ ok: false, error: "Too many requests. Please slow down and try again." }, { status: 429 });
  if (retryAfterSeconds) response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

export function respondForbidden(message = "You don't have access to this resource.") {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}

export function respondBadRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

/**
 * Maps a caught error to a safe HTTP response. Known, safe-to-surface error
 * types get a specific status and their own (already user-safe) message.
 * Anything else is logged server-side only (never sent to the client) and
 * becomes a generic 500 — no stack trace, no raw Supabase/Alpaca error body,
 * no internal detail ever reaches the response.
 */
export function respondError(error: unknown) {
  if (error instanceof UnauthenticatedError) {
    return respondUnauthorized();
  }

  if (error instanceof SymbolNotInUniverseError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  if (error instanceof DuplicateSubmissionError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
  }

  if (error instanceof BrokerConfigError) {
    // Safe to surface: this message names which env vars are missing, never
    // a value. 503 — the read-only broker data this route needs just isn't
    // available right now, not a client mistake.
    return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
}
