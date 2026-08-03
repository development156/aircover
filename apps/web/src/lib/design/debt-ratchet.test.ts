import { describe, expect, test } from 'vitest'

import { EYEBROW_EXCEPTIONS } from './eyebrow-exceptions'
import { INK_FAINT_EXCEPTIONS } from './ink-faint-exceptions'

/**
 * THE RATCHET. The design-debt registers may only ever SHRINK.
 *
 * An exceptions list without a ratchet is just a suppression list with better
 * manners. The `--ink-faint` register exists because 48 uses of an unreadable
 * token accumulated one reasonable-looking commit at a time, and every one of
 * those commits could have written "declare it in the exceptions file" and been
 * green. So the register is capped, here, at the counts it held the day the debt
 * was recorded.
 *
 * Adding an entry fails this test. Adding a use inside an existing entry fails
 * this test. Fixing something and deleting its entry passes — and you should
 * then lower the baseline below, which is the only edit to these numbers that is
 * ever legitimate.
 *
 *   ▲ THESE NUMBERS MAY ONLY GO DOWN. ▲
 *
 * If you are about to raise one, what you actually want is to fix the file. If a
 * genuinely new `legitimate` case appears (a real disabled control, a real
 * aria-hidden glyph), that is the one case where a baseline may rise — and it
 * needs a human on the PR saying so out loud, which is exactly the friction this
 * is here to create.
 *
 * Baseline set 2026-07-28, at the `wt-admin` trunk merge.
 * Owner of getting these to their floor: SL-044 (Week 1 chore, not launch scope).
 */

/** ink-faint: 3 legitimate files (4 uses) + 16 admin debt files (24 uses). */
// Lowered 2026-08-01 (SL-062): `roadmap-card.tsx` was replaced by `hero-card.tsx`,
// which paints no content with --ink-faint, so its 1 debt use is gone rather than
// moved. Deleting an entry without lowering the baseline would leave headroom for
// the next regression to slip into for free — the ratchet only works if it tightens.
const INK_FAINT_BASELINE = Object.freeze({ files: 18, uses: 27, debtFiles: 15, debtUses: 23 })

/** eyebrow: 0 legitimate + 4 admin debt files (5 uses — qa-console-view has two). */
const EYEBROW_BASELINE = Object.freeze({ files: 4, uses: 5, debtFiles: 4, debtUses: 5 })

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0)

const inkFaint = Object.values(INK_FAINT_EXCEPTIONS)
const eyebrow = Object.values(EYEBROW_EXCEPTIONS)

const RATCHET_MESSAGE =
  'The design-debt register grew. It is a ratchet: it may only shrink. Fix the file and ' +
  'delete its entry rather than adding one. If this is a genuinely new legitimate ' +
  '(disabled/aria-hidden) case, lowering-only is waived — but say so explicitly on the PR ' +
  'and move the baseline in the same commit.'

describe('design-debt ratchet', () => {
  test('the ink-faint register has not grown', () => {
    expect(Object.keys(INK_FAINT_EXCEPTIONS).length, RATCHET_MESSAGE).toBeLessThanOrEqual(
      INK_FAINT_BASELINE.files,
    )
    expect(sum(inkFaint.map((e) => e.uses)), RATCHET_MESSAGE).toBeLessThanOrEqual(
      INK_FAINT_BASELINE.uses,
    )
  })

  test('the eyebrow register has not grown', () => {
    expect(Object.keys(EYEBROW_EXCEPTIONS).length, RATCHET_MESSAGE).toBeLessThanOrEqual(
      EYEBROW_BASELINE.files,
    )
    expect(sum(eyebrow.map((e) => e.uses)), RATCHET_MESSAGE).toBeLessThanOrEqual(
      EYEBROW_BASELINE.uses,
    )
  })

  test('debt specifically has not grown — a fix may not be traded for a new defect', () => {
    // Counted apart from the total on purpose. Without this, deleting a legitimate entry
    // would create headroom for a brand-new debt entry and the totals would still pass.
    const inkDebt = inkFaint.filter((e) => e.kind === 'debt')
    expect(inkDebt.length, RATCHET_MESSAGE).toBeLessThanOrEqual(INK_FAINT_BASELINE.debtFiles)
    expect(sum(inkDebt.map((e) => e.uses)), RATCHET_MESSAGE).toBeLessThanOrEqual(
      INK_FAINT_BASELINE.debtUses,
    )

    const eyebrowDebt = eyebrow.filter((e) => e.kind === 'debt')
    expect(eyebrowDebt.length, RATCHET_MESSAGE).toBeLessThanOrEqual(EYEBROW_BASELINE.debtFiles)
    expect(sum(eyebrowDebt.map((e) => e.uses)), RATCHET_MESSAGE).toBeLessThanOrEqual(
      EYEBROW_BASELINE.debtUses,
    )
  })

  test('every debt entry names a card and a date, so none of it is anonymous', () => {
    for (const [file, e] of Object.entries(INK_FAINT_EXCEPTIONS)) {
      expect(e.since, `${file} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      if (e.kind === 'debt') expect(e.card, `${file} is debt with no card`).toMatch(/^SL-\d+$/)
    }
    for (const [file, e] of Object.entries(EYEBROW_EXCEPTIONS)) {
      expect(e.since, `${file} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.card, `${file} is debt with no card`).toMatch(/^SL-\d+$/)
    }
  })

  test('no entry is a glob — exact paths only', () => {
    // A directory wildcard would let all future admin drift hide inside one entry.
    for (const path of [...Object.keys(INK_FAINT_EXCEPTIONS), ...Object.keys(EYEBROW_EXCEPTIONS)]) {
      expect(path, `${path} looks like a pattern, not a file`).not.toMatch(/[*?]|\*\*/)
      expect(path, `${path} is not a source file`).toMatch(/\.tsx?$/)
    }
  })
})
