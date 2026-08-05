import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Defense-in-depth against a secret ending up in audit_log.payload by
// accident: every payload is scanned (key names AND stringified values)
// for these substrings before insert. Callers are still expected to pass a
// deliberately curated, allow-listed payload (never "the whole
// request/response object") — this is a backstop, not the primary control.
const FORBIDDEN_SUBSTRINGS = ["secret", "api_key", "apikey", "api-key", "password", "token"];

export class AuditLogSecretGuardError extends Error {
  constructor(matchedTerm: string) {
    super(
      `Refusing to write audit_log entry: payload appears to contain a secret-like field ("${matchedTerm}"). ` +
        "Pass an explicit, curated payload — never a raw request/response object."
    );
    this.name = "AuditLogSecretGuardError";
  }
}

function assertNoSecretsIn(payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const term of FORBIDDEN_SUBSTRINGS) {
    if (serialized.includes(term)) {
      throw new AuditLogSecretGuardError(term);
    }
  }
}

export interface AuditEvent {
  userId: string;
  accountId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}

export async function logEvent(supabase: SupabaseClient<Database>, event: AuditEvent) {
  const payload = event.payload ?? {};
  assertNoSecretsIn(payload);

  const { error } = await supabase.from("audit_log").insert({
    user_id: event.userId,
    account_id: event.accountId ?? null,
    event_type: event.eventType,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    payload,
  });

  if (error) throw new Error(`Failed to write audit_log entry: ${error.message}`);
}

/**
 * Identical behavior to logEvent (throws on failure) — a distinctly-named
 * alias used ONLY for the critical order-lifecycle events documented in
 * lib/order-executor/README.md (confirmation, execution start/success/
 * rejection, duplicate-submission prevention, state-transition/
 * reconciliation events). The point of the separate name is that a reader
 * can tell, at the call site, which guarantee applies without re-deriving
 * it: `logCriticalEvent` means "a failure here must abort or escalate the
 * operation"; `logEventSafely` means "informational only, safe to swallow."
 */
export const logCriticalEvent = logEvent;

/**
 * Same as logEvent, but never throws — used from the order-execution path
 * (lib/order-executor/), where a logging failure (a DB hiccup, or the
 * secret guard above tripping on unexpectedly-shaped error text) must
 * never mask or crash the actual order result the caller is waiting on.
 * Failures here are only reported to the server console.
 */
export async function logEventSafely(supabase: SupabaseClient<Database>, event: AuditEvent): Promise<void> {
  try {
    await logEvent(supabase, event);
  } catch (error) {
    console.error("audit_log write failed (swallowed to avoid masking the caller's result):", error);
  }
}
