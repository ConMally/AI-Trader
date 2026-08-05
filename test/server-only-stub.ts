// The real "server-only" package unconditionally throws unless the bundler
// (Next.js) aliases it away — that aliasing only happens in Next's own
// webpack/Turbopack build, not under plain Node/vitest. This no-op stub is
// aliased in for tests only (see vitest.config.ts) so modules that
// `import "server-only"` for defense-in-depth against client bundling stay
// unit-testable. The real package's real behavior still applies to the
// actual `next build`.
export {};
