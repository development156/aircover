import type { RemixBatch } from '@sahoda/shared'

/**
 * WHICH BATCH STATES ARE STILL A DECISION — and why this is its own file.
 *
 * ── IT LIVES HERE BECAUSE `read.ts` IS `server-only` ─────────────────────────
 * `batch-preview.tsx` is a `'use client'` component and it needs this answer:
 * the page decides which half to render and the panel decides whether to show a
 * button. Reaching into `lib/remix/read.ts` for it VALUE-imports a module whose
 * first line is `import 'server-only'`, which is not a lint opinion — the
 * production build fails outright with "You're importing a component that needs
 * server-only". MEASURED: it failed the gate's build leg, which is the leg that
 * catches this class and the reason it is in the gate at all.
 *
 * A TYPE import from that module stays fine and is what the panel still does;
 * types are erased. This is the value half, and it is pure.
 *
 * ── `running` IS TERMINAL, AND THAT IS THE POINT ─────────────────────────────
 * Nothing in this codebase resumes a batch. A request cut off mid-spend leaves
 * the row at `running` for ever, so treating it as live would wedge the screen:
 * the preview would render, its only button refuses a running batch, and the
 * planner that could start a fresh one would never appear. Terminal here means
 * the person can start again, which is the only thing that helps them — and the
 * run reports what became of the stopped one rather than claiming it was made.
 */
export function isSettled(status: RemixBatch['status']): boolean {
  return status === 'done' || status === 'failed' || status === 'running'
}
