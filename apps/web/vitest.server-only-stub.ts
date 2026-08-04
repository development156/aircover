// Vitest stand-in for the `server-only` package, which throws when imported
// outside a React Server context. Tests run in plain node and import server
// modules (e.g. src/lib/env.ts) directly; the alias in vitest.config.ts points
// `server-only` here so the poison-pill stays active in the real app while
// tests can exercise the module's behavior.
export {}
