import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * EVERY EXPORT FROM A `'use server'` MODULE MUST BE AN ASYNC FUNCTION.
 *
 * ── WHY THIS EXISTS, AND WHAT IT COST TO LEARN ───────────────────────────────
 * Next enforces this at BUILD time and nothing before it does. On 2026-08-20 a
 * synchronous helper was exported from `loop-create.ts` so a unit test could
 * import it. It passed `tsc --noEmit`. It passed 3,366 unit tests. It failed
 * `next build` with a webpack error, which is the last gate before a deploy and
 * the slowest place to find out.
 *
 * The rule is already written down twice in this directory — `plan-week.ts` and
 * `posts-ai.ts` both explain it in a comment above their module-private
 * singletons. A comment is not a check, and the fix was to move the helper to
 * `lib/`, where it belonged anyway.
 *
 * ── WHY A SOURCE SCAN AND NOT AN IMPORT ──────────────────────────────────────
 * Importing these modules executes `createMesh()` and Clerk's `auth()` binding
 * at module scope, which needs a server runtime. The text is what Next reads
 * too, so reading it is not a lesser check here.
 */

const ACTIONS = resolve(import.meta.dirname)

/** Source with comments and string literals' contents removed, so prose cannot match. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const files = readdirSync(ACTIONS).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
)

describe("'use server' modules export only async functions", () => {
  it('finds the action modules to check', () => {
    // A glob that matches nothing passes every assertion under it. Pinned so an
    // empty sweep can never read as a clean one.
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    const src = readFileSync(resolve(ACTIONS, file), 'utf8')
    const isUseServer = /^\s*['"]use server['"]/m.test(code(src))
    if (!isUseServer) continue

    it(`${file}`, () => {
      // Every `export` that is not `export async function` and not a type-only
      // export. `export const X = ...` and `export function X()` both break the
      // build; `export type` and `export interface` are erased and are fine.
      const offenders = [...code(src).matchAll(/^export\s+(?!async\s+function\b)(\w+)/gm)]
        .map((m) => m[1])
        .filter((kw) => kw !== 'type' && kw !== 'interface')
      expect(
        offenders,
        `${file} exports ${offenders.join(', ')} — a 'use server' module may export only async functions, and next build is the only thing that says so`,
      ).toEqual([])
    })
  }
})
