# Repositories

**Status:** Phase 1 implemented for the tables this phase touches.

Thin, typed data-access layer between the app and Supabase — every function takes an already-
constructed `SupabaseClient<Database>` as its first argument (dependency injection, so callers
choose the anon/session-scoped client or the service-role client, and everything here stays
unit-testable with a fake client). Visual components and route handlers should go through these,
never call `createClient()`/`createServerClient()` and query tables directly.

One file per table: `accounts-repository.ts`, `universe-repository.ts`,
`proposals-repository.ts` (includes `transitionToExecuting` — the atomic approve→executing
conditional update the Order Executor relies on), `orders-repository.ts`, `positions-repository.ts`,
`audit-log-repository.ts` (enforces a secret-scanning guard on every payload before insert — see
`AuditLogSecretGuardError`), `market-data-repository.ts`, `market-calendar-repository.ts` (the
DB-backed wrappers around `lib/calendar/service.ts`'s pure functions), and
`broker-account-snapshots-repository.ts`.
