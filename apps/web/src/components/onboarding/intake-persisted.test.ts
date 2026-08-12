import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Reachability guard: onboarding's Finish must actually hand the intake over.
 *
 * `storedIntakeFrom` and `saveBrandMemory`'s carry-forward are both unit-tested,
 * and both would keep passing if the flow simply never called one with the
 * other. The whole feature would then be a correct function nobody invokes —
 * which is precisely what `checkEntitlement` was before wt-limits mounted it,
 * and what the auto-publish gate was before it was found to be reading a status
 * apps/web has never written. Two lanes, two months, the same shape.
 *
 * ── WHY THIS READS THE SOURCE INSTEAD OF RENDERING THE FLOW ──────────────────
 * `onboarding-flow.tsx` is a client component over `useActionState`, a router
 * and three server actions; driving it to the Finish button in jsdom would be a
 * long, fragile test of everything except the one line at issue. The same
 * technique already guards `brand-field.ts` against ever importing the mesh.
 *
 * It asserts the WIRING, not the rule — the rule is
 * `to-stored-intake.test.ts` and `brand-intake.test.ts`.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const FLOW = resolve(HERE, 'onboarding-flow.tsx')

const source = readFileSync(FLOW, 'utf8')

/** The `saveBrandMemory(...)` call, from the open paren to the matching close. */
function saveCall(): string {
  const start = source.indexOf('saveBrandMemory(')
  // Guards the guard. A renamed action or a moved call would otherwise make
  // every assertion below pass against an empty string.
  expect(start, 'onboarding-flow.tsx no longer calls saveBrandMemory(').toBeGreaterThan(-1)

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

describe('onboarding persists the intake it collected', () => {
  test('the flow imports the mapper rather than building an intake by hand', () => {
    // By hand is how a `consumer` default gets written as though the customer
    // had declared it. The mapper is the only thing that knows not to.
    expect(source).toMatch(
      /import \{ storedIntakeFrom \} from '@\/lib\/onboarding\/to-stored-intake'/,
    )
  })

  test('Finish passes it to saveBrandMemory', () => {
    expect(saveCall()).toContain('storedIntakeFrom(')
  })

  test('it is built from the real onboarding inputs, not from a placeholder', () => {
    // `intakeText` and `overrides` are what the customer typed and picked;
    // `door` is the richer text an assumed pick yields to. Passing constants
    // here would store the same regime for every workspace on earth.
    const call = saveCall()
    expect(call).toContain('intakeText')
    expect(call).toContain('overrides')
    expect(call).toContain('door?.text')
  })
})
