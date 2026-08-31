import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * `workspaces.business_model`, `.regime` and `.locale` are a COPY. This pins
 * which copy is the one that decides anything.
 *
 * ── WHY THIS IS A GUARD AND NOT A DELETION ───────────────────────────────────
 * The three columns are written once, at onboarding, by
 * `brand-resolve.ts` — and read by nothing. An audit called them settings that
 * do nothing, and that is true, but the fix is not to wire them up: the SAME
 * three values already live in `brand_memory.payload.intake`, and that copy is
 * read for real. `resolve-ruleset.ts` picks the refusal rule packs with
 * `packsFor(regime, locale)` from it, and `question.ts` localises onboarding
 * copy from it.
 *
 * So the defect is not an unread column. It is TWO copies of one fact, one of
 * which is authoritative and neither of which says so. The columns are written
 * at resolve time and never updated again, so the day somebody reads
 * `workspaces.regime` believing it current, a business whose intake has changed
 * gets judged against the wrong rule pack — quietly, and only for the customers
 * who changed something.
 *
 * Deleting the columns is a migration against a table other lanes own and is not
 * this change's to make. What this change can do is make the next reader
 * conscious: start reading them for behaviour and this test fails, which is
 * where the reconciliation gets decided rather than assumed.
 */

const WEB = join(__dirname, '../../../')

/** Every place in apps/web that names one of the three columns. */
function hits(pattern: string): string[] {
  try {
    const out = execFileSync(
      'grep',
      ['-rn', '--include=*.ts', '--include=*.tsx', '-E', pattern, 'src'],
      { cwd: WEB, encoding: 'utf8' },
    )
    return out.trim().split('\n').filter(Boolean)
  } catch {
    // grep exits 1 when nothing matches, which is a valid answer here.
    return []
  }
}

describe('the three intake columns on workspaces', () => {
  it('are written in exactly one place, and it is the onboarding resolve', () => {
    const writes = hits('business_model:').filter((l) => !l.includes('.test.'))
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('brand-resolve.ts')
  })

  it('are read for behaviour by nothing', () => {
    // A read would look like a select naming the column, or a filter on it.
    // `select('*')` in the data export is deliberately not a behaviour read: it
    // hands the customer their own row verbatim and decides nothing.
    const reads = hits(
      "select\\(['\"][^'\"]*business_model|eq\\('(business_model|regime|locale)'",
    ).filter((l) => !l.includes('.test.'))
    expect(reads).toEqual([])
  })

  it('are not the copy the refusal gate reads', () => {
    // The authoritative copy, named here so this test fails loudly if the gate
    // is ever repointed at the columns without the staleness being addressed.
    const gate = hits('packsFor\\(')
    expect(gate.length).toBeGreaterThan(0)
    expect(gate.some((l) => l.includes('workspaces'))).toBe(false)
  })
})
