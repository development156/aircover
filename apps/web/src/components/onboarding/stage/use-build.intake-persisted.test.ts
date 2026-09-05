import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Reachability guard: the stage's Approve must actually hand the intake over.
 *
 * ── RETARGETED, NOT DELETED ──────────────────────────────────────────────────
 * This guard lived beside `onboarding-flow.tsx` as `intake-persisted.test.ts`
 * and read THAT file. `onboarding-stage.tsx` replaced the flow as the mount
 * point for /onboarding, the flow was deleted on 2026-09-06 (docs/51, Q-24),
 * and the wiring it guarded — `saveBrandMemory(..., storedIntakeFrom(...))` —
 * now lives in `use-build.ts` with nothing watching it. A guard that reads a
 * file nothing mounts is green forever; this one follows the call.
 *
 * `storedIntakeFrom` and `saveBrandMemory`'s carry-forward are both unit-tested,
 * and both would keep passing if the stage simply never called one with the
 * other. The whole feature would then be a correct function nobody invokes —
 * which is precisely what `checkEntitlement` was before wt-limits mounted it.
 *
 * ── WHY THIS READS THE SOURCE INSTEAD OF RENDERING THE HOOK ──────────────────
 * `useBuild` is a hook over three server actions, a door wait and an orb ref;
 * driving it to Approve in jsdom would be a long, fragile test of everything
 * except the one line at issue. It asserts the WIRING, not the rule — the rule
 * is `to-stored-intake.test.ts` and `brand-intake.test.ts`.
 *
 * WHAT IT CANNOT SEE: it matches text. A call moved behind a helper by another
 * name, a `saveBrandMemory` reached through a wrapper, or an intake built by a
 * function that is not spelled `storedIntakeFrom(` all pass this scan while
 * breaking what it scans for.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(HERE, 'use-build.ts'), 'utf8')

/** The `saveBrandMemory(...)` call, from the open paren to the matching close. */
function saveCall(): string {
  const start = source.indexOf('saveBrandMemory(')
  // Guards the guard. A renamed action or a moved call would otherwise make
  // every assertion below pass against an empty string.
  expect(start, 'use-build.ts no longer calls saveBrandMemory(').toBeGreaterThan(-1)

  let depth = 0
  for (let i = source.indexOf('(', start); i < source.length; i += 1) {
    if (source[i] === '(') depth += 1
    else if (source[i] === ')') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error('unbalanced parentheses in the saveBrandMemory call')
}

describe('the stage persists the intake it collected', () => {
  test('it imports the mapper rather than building an intake by hand', () => {
    // By hand is how a `consumer` default gets written as though the customer
    // had declared it. The mapper is the only thing that knows not to.
    expect(source).toMatch(
      /import \{ storedIntakeFrom \} from '@\/lib\/onboarding\/to-stored-intake'/,
    )
  })

  test('Approve passes it to saveBrandMemory', () => {
    expect(saveCall()).toContain('storedIntakeFrom(')
  })

  test('it is built from what the customer typed and what the door found', () => {
    // `intakeTextOf(data)` is the customer's own sentences; `doorText(...)` is
    // the richer text a fetched site yields to. Passing constants here would
    // store the same regime for every workspace on earth.
    //
    // The overrides argument is `{}` ON PURPOSE, and `intakeTextOf`'s own
    // comment says why: the stage's chips are not the intake's vocabulary, and
    // an override is persisted as `declared`. Asserting `overrides` here, as the
    // old guard did against the old flow, would demand the exact fabrication
    // the stage declined to make.
    const call = saveCall()
    expect(call).toContain('intakeTextOf(data)')
    expect(call).toContain('doorText(')
  })
})
