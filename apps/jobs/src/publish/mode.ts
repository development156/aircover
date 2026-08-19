/**
 * Which rail a publish went out on.
 *
 * ── WHY A TWO-VALUE UNION HAS ITS OWN FILE ───────────────────────────────────
 * It used to live in `runPublishPost.ts`, and the dispatcher imported it from
 * there — as `import type`, so nothing was pulled at runtime. But the boundary
 * guard in `sweeps.test.ts` walks import SPECIFIERS, not runtime edges, and it is
 * right to: a type-only import today is one refactor away from a value import,
 * and the file it points at is the publish orchestrator.
 *
 * The guard fired the moment `runPublishPost` gained a `@sahoda/publishing`
 * import (the format refusal), because that made it a heavy module the SQL-only
 * serverless bundle could reach on paper. Loosening the walker to ignore type
 * imports would have made the guard quieter without making the graph better.
 * Moving the type to a leaf with no imports of its own removes the edge instead.
 */
export type PublishMode = 'live' | 'fixture'
