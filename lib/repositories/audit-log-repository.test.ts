import { describe, expect, it, vi } from "vitest";
import { AuditLogSecretGuardError, logEvent } from "./audit-log-repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function fakeSupabase(insertMock = vi.fn().mockResolvedValue({ error: null })) {
  return { from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as SupabaseClient<Database>;
}

describe("logEvent secret guard", () => {
  it("writes a clean, curated payload", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = fakeSupabase(insertMock);

    await logEvent(supabase, {
      userId: "u1",
      eventType: "order_submitted",
      entityType: "proposal",
      payload: { symbol: "AAPL", qty: 1 },
    });

    expect(insertMock).toHaveBeenCalled();
  });

  it("refuses a payload with a secret-like key", async () => {
    const supabase = fakeSupabase();

    await expect(
      logEvent(supabase, {
        userId: "u1",
        eventType: "broker_request",
        entityType: "order",
        payload: { headers: { "APCA-API-SECRET-KEY": "shh" } },
      })
    ).rejects.toBeInstanceOf(AuditLogSecretGuardError);
  });

  it("refuses a payload with a secret-like value even under an innocuous key", async () => {
    const supabase = fakeSupabase();

    await expect(
      logEvent(supabase, {
        userId: "u1",
        eventType: "broker_request",
        entityType: "order",
        payload: { note: "used api_key xyz to authenticate" },
      })
    ).rejects.toBeInstanceOf(AuditLogSecretGuardError);
  });
});
