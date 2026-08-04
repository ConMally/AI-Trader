# Repositories

**Status:** not implemented (Phase 1+, grows through later phases)

Thin, typed data-access layer between the app and Supabase, following the
same pattern as the sibling Workout App project (`lib/repositories/` there):
one file per aggregate (e.g. `accounts-repository.ts`, `proposals-
repository.ts`), so visual components and route handlers never call
`createClient()`/`createServerClient()` directly. Built incrementally as
each phase needs a new table, rather than all at once in Phase 0.
