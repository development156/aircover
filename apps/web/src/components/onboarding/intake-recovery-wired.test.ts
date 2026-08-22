import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Reachability guard: the buffer must actually be written and read.
 *
 * `intake-recovery.test.ts` proves the buffer works. It would keep passing if
 * `onboarding-flow.tsx` never called it — a correct function nobody invokes,
 * which is the exact shape `intake-persisted.test.ts` was written to catch one
 * step further along the same flow, and the shape `checkEntitlement` had before
 * wt-limits mounted it.
 *
 * ── WHY THIS READS THE SOURCE INSTEAD OF RENDERING THE FLOW ─────────────────
 * `onboarding-flow.tsx` is a client component over `useActionState`, a router
 * and three server actions. Driving it to a reload in jsdom would be a long,
 * fragile test of everything except the three lines at issue — and this file
 * follows the technique the flow's own sibling guard already established.
 *
 * It asserts the WIRING, not the rule.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(HERE, 'onboarding-flow.tsx'), 'utf8')

describe('onboarding-flow.tsx uses the crash buffer', () => {
  test('it imports all three halves', () => {
    // Guards the guard: a renamed module would otherwise make every assertion
    // below pass against a file that no longer touches the buffer.
    expect(source).toMatch(/from '\.\/intake-recovery'/)
    for (const fn of ['stashIntake', 'readIntakeStash', 'clearIntakeStash']) {
      expect(source, `${fn} is imported but never used`).toMatch(new RegExp(`${fn}\\s*\\(`))
    }
  })

  test('the recovery happens in a state initialiser, not an effect', () => {
    // An effect renders the empty box first and then replaces it, which reads
    // as "my words were lost, then came back" — and on a slow paint the
    // customer starts retyping into a field about to be overwritten.
    expect(source).toMatch(/useState\(\(\) =>[^)]*readIntakeStash\(\)/)
  })

  test('a saved brain wins over a recovered draft', () => {
    // A resolve that FINISHED outranks the words that preceded one. Without
    // this, re-entering a finished onboarding would reopen the intake.
    expect(source).toMatch(/savedBrain \?[^:]*null[^:]*:\s*readIntakeStash\(\)/)
  })

  test('the stash is written whenever the typed answers or the step move', () => {
    const effect = source.slice(source.indexOf('stashIntake('))
    const deps = effect.slice(0, effect.indexOf('])') + 2)

    // All three, or a reload loses whichever one was left out.
    expect(deps).toMatch(/\[screen, intakeText, overrides\]/)
  })

  test('a landed resolve clears it', () => {
    // After the resolve the brain is the record; leaving this behind would put
    // a stale second copy of the intake in front of the next mount.
    const afterOk = source.slice(source.indexOf("setScreen('reveal')"))
    expect(afterOk.slice(0, 400)).toMatch(/clearIntakeStash\(\)/)
  })
})
