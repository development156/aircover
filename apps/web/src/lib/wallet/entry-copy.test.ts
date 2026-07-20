import { describe, expect, test } from 'vitest'
import { LedgerEntryTypeSchema, ModelTierSchema, type LedgerEntry } from '@sahoda/shared'

import { describeEntry } from './entry-copy'

const IDEMPOTENCY_KEY = 'post_variants:8f3a-0001:1:debit'

/** A row shaped exactly as PostgREST returns it from `credit_ledger`. */
function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    seq: 1,
    entry_type: 'DEBIT',
    amount: 3,
    balance_after: 88,
    action_type: 'post_variants',
    object_ref: 'post:8f3a',
    model_tier: null,
    cogs_usd_est: null,
    idempotency_key: IDEMPOTENCY_KEY,
    settles_entry_id: '33333333-3333-4333-8333-333333333333',
    hold_expires_at: null,
    actor: 'user_2abcDEF',
    meta: { internal_note: 'do not render me' },
    created_at: '2026-07-19T10:00:00.000Z',
    ...overrides,
  }
}

describe('describeEntry — coverage of the ledger vocabulary', () => {
  // Driven off the enum itself: adding a member to LedgerEntryTypeSchema without
  // teaching this module about it must fail here, not ship a blank wallet row.
  test.each(LedgerEntryTypeSchema.options)('renders a complete display for %s', (entryType) => {
    const display = describeEntry(entry({ entry_type: entryType, amount: 7 }))

    expect(display.label.length).toBeGreaterThan(0)
    expect(display.label).not.toMatch(/unknown|undefined|null/i)
    expect(display.signedAmount).toMatch(/^[+-]?\d+$/)
    expect(['credit', 'debit', 'neutral']).toContain(display.direction)
    expect(typeof display.pending).toBe('boolean')
  })

  test.each(LedgerEntryTypeSchema.options)(
    'never renders the raw entry_type token for %s',
    (entryType) => {
      const display = describeEntry(entry({ entry_type: entryType }))

      expect(display.label).not.toContain(entryType)
    },
  )
})

describe('describeEntry — direction comes from entry_type, never from the amount', () => {
  test('renders a DEBIT as negative even though the stored amount is positive', () => {
    const display = describeEntry(entry({ entry_type: 'DEBIT', amount: 3 }))

    expect(display.direction).toBe('debit')
    expect(display.signedAmount).toBe('-3')
  })

  test('renders a DEBIT as negative even if the stored amount is wrongly negative', () => {
    // The contract says amount is always positive except ADJUST. If a writer ever
    // violates that, the sign must still come from entry_type — never '+-3'.
    const display = describeEntry(entry({ entry_type: 'DEBIT', amount: -3 }))

    expect(display.signedAmount).toBe('-3')
  })

  test('renders a GRANT as a positive credit', () => {
    const display = describeEntry(entry({ entry_type: 'GRANT', amount: 50, action_type: null }))

    expect(display.direction).toBe('credit')
    expect(display.signedAmount).toBe('+50')
  })

  test('labels the signup grant as welcome credits, never as plan credits', () => {
    // `bootstrap_workspace` writes the 100-credit signup grant with
    // `action_type: 'signup_grant'`. A fresh user has no plan, so "Included
    // with your plan" would be a false claim on the very first wallet row.
    const display = describeEntry(
      entry({ entry_type: 'GRANT', amount: 100, action_type: 'signup_grant', object_ref: null }),
    )

    expect(display.label).toBe('Welcome credits')
    expect(display.why).toBe('Included free when you signed up.')
    expect(display.direction).toBe('credit')
    expect(display.signedAmount).toBe('+100')
  })

  test('keeps the plan copy for a GRANT without a signup action_type', () => {
    // `applyPlanGrant` writes plan grants with a null action_type — those ARE
    // plan credits, and the existing copy stays true for them.
    const display = describeEntry(
      entry({ entry_type: 'GRANT', amount: 1500, action_type: null, object_ref: null }),
    )

    expect(display.label).toBe('Plan credits')
    expect(display.why).toBe('Included with your plan.')
  })

  test('renders a TOPUP as a positive credit', () => {
    const display = describeEntry(entry({ entry_type: 'TOPUP', amount: 500, action_type: null }))

    expect(display.direction).toBe('credit')
    expect(display.signedAmount).toBe('+500')
  })

  test('renders a PERF_REWARD as a positive credit', () => {
    const display = describeEntry(entry({ entry_type: 'PERF_REWARD', amount: 2 }))

    expect(display.direction).toBe('credit')
    expect(display.signedAmount).toBe('+2')
  })

  test('renders a RELEASE as a reservation undone, not as credits gained', () => {
    // apply_ledger_entry settles a RELEASE with `balance_held -= hold.amount`
    // and leaves `balance_total` alone — the wallet gains nothing. A '+3' here
    // would invent a credit the user never received.
    const display = describeEntry(entry({ entry_type: 'RELEASE', amount: 3 }))

    expect(display.direction).toBe('neutral')
    expect(display.signedAmount).toBe('3')
    expect(display.why).toMatch(/not charged|returned|did not complete/i)
  })

  test('a hold/release pair nets to zero across the two rows', () => {
    // The pair must not read as a gain in a scan of the list, exactly as a
    // hold/debit pair must not read as paying twice.
    const hold = describeEntry(entry({ entry_type: 'HOLD', amount: 3 }))
    const release = describeEntry(entry({ entry_type: 'RELEASE', amount: 3 }))

    expect(hold.signedAmount).not.toMatch(/^[+-]/)
    expect(release.signedAmount).not.toMatch(/^[+-]/)
    expect([hold.direction, release.direction]).toEqual(['neutral', 'neutral'])
  })

  test('only a settled DEBIT carries a minus across the whole hold lifecycle', () => {
    const lifecycle = (['HOLD', 'RELEASE', 'DEBIT'] as const).map(
      (entryType) => describeEntry(entry({ entry_type: entryType, amount: 3 })).signedAmount,
    )

    expect(lifecycle.filter((amount) => amount.startsWith('-'))).toEqual(['-3'])
  })

  test('renders an EXPIRE as a negative that is not framed as a purchase', () => {
    const display = describeEntry(entry({ entry_type: 'EXPIRE', amount: 40, action_type: null }))

    expect(display.direction).toBe('debit')
    expect(display.signedAmount).toBe('-40')
    expect(display.label).toMatch(/expire/i)
  })
})

describe('describeEntry — ADJUST is the only type whose sign follows the amount', () => {
  test('renders a negative ADJUST as a debit', () => {
    const display = describeEntry(entry({ entry_type: 'ADJUST', amount: -12, action_type: null }))

    expect(display.direction).toBe('debit')
    expect(display.signedAmount).toBe('-12')
  })

  test('renders a positive ADJUST as a credit', () => {
    const display = describeEntry(entry({ entry_type: 'ADJUST', amount: 12, action_type: null }))

    expect(display.direction).toBe('credit')
    expect(display.signedAmount).toBe('+12')
  })

  test('renders a zero ADJUST as neutral without a misleading sign', () => {
    const display = describeEntry(entry({ entry_type: 'ADJUST', amount: 0, action_type: null }))

    expect(display.direction).toBe('neutral')
    expect(display.signedAmount).toBe('0')
  })
})

describe('describeEntry — a HOLD is reserved, not spent', () => {
  test('marks a HOLD as pending', () => {
    const display = describeEntry(entry({ entry_type: 'HOLD', amount: 3 }))

    expect(display.pending).toBe(true)
  })

  test('does not mark a settled DEBIT as pending', () => {
    const display = describeEntry(entry({ entry_type: 'DEBIT', amount: 3 }))

    expect(display.pending).toBe(false)
  })

  test('reads differently from a DEBIT: no minus sign and a reserved explanation', () => {
    const hold = describeEntry(entry({ entry_type: 'HOLD', amount: 3 }))
    const debit = describeEntry(entry({ entry_type: 'DEBIT', amount: 3 }))

    expect(hold.signedAmount).toBe('3')
    expect(hold.direction).toBe('neutral')
    expect(hold.why).toMatch(/reserved/i)
    expect(hold.why).not.toEqual(debit.why)
  })

  test('tells the user a failed action returns the reserved credits', () => {
    const display = describeEntry(entry({ entry_type: 'HOLD', amount: 3 }))

    expect(display.why).toMatch(/returned|not charged/i)
  })
})

describe('describeEntry — action labels', () => {
  test('maps a known action_type to a human label', () => {
    const display = describeEntry(entry({ action_type: 'post_variants' }))

    expect(display.label).toMatch(/post variants/i)
  })

  test('maps every priced action to a label that is not the raw snake_case token', () => {
    const actions = ['caption_rewrite', 'image_premium', 'site_generate', 'brand_research']

    for (const action of actions) {
      const display = describeEntry(entry({ action_type: action }))

      expect(display.label).not.toContain('_')
      expect(display.label).not.toBe(action)
    }
  })

  test('humanises an unrecognised but well-formed action_type instead of dumping the token', () => {
    const display = describeEntry(entry({ action_type: 'future_new_action' }))

    expect(display.label).not.toContain('_')
    expect(display.label).toMatch(/future new action/i)
  })

  test('falls back to a generic label for an action_type that is not safe to show', () => {
    const hostile = [
      '<script>alert(1)</script>',
      'DROP TABLE credit_ledger;--',
      '   ',
      'x'.repeat(80),
    ]

    for (const action of hostile) {
      const display = describeEntry(entry({ action_type: action }))

      expect(display.label).toMatch(/^AI action$/i)
    }
  })

  test('falls back to a generic label when action_type is null on a spend', () => {
    const display = describeEntry(entry({ entry_type: 'DEBIT', action_type: null }))

    expect(display.label).toMatch(/ai action/i)
  })
})

describe('describeEntry — model tier honesty', () => {
  test('never invents a tier when model_tier is null', () => {
    // withCredits writes model_tier: null on every DEBIT today, so this is the
    // common case, not an edge case.
    const display = describeEntry(entry({ entry_type: 'DEBIT', model_tier: null }))

    for (const tier of ModelTierSchema.options) {
      expect(display.why ?? '').not.toMatch(new RegExp(tier, 'i'))
    }
  })

  test('says the tier was not recorded rather than staying silent about it', () => {
    const display = describeEntry(entry({ entry_type: 'DEBIT', model_tier: null }))

    expect(display.why).toMatch(/not recorded/i)
  })

  test('reports the tier when one was actually recorded', () => {
    const display = describeEntry(entry({ entry_type: 'DEBIT', model_tier: 'premium' }))

    expect(display.why).toMatch(/premium/i)
    expect(display.why).not.toMatch(/not recorded/i)
  })

  test('does not claim a HOLD is missing a tier it could not have yet', () => {
    // withCredits reserves credits BEFORE the model call, so a HOLD legitimately
    // has no tier. "Not recorded" there would imply data was lost.
    const display = describeEntry(entry({ entry_type: 'HOLD', model_tier: null }))

    expect(display.why ?? '').not.toMatch(/not recorded/i)
  })
})

describe('describeEntry — provider cost', () => {
  test('renders a numeric-string cogs value as a dollar amount', () => {
    const display = describeEntry(entry({ cogs_usd_est: '0.0123' }))

    expect(display.why).toMatch(/\$0\.0123/)
  })

  test('renders a numeric cogs value as a dollar amount', () => {
    const display = describeEntry(entry({ cogs_usd_est: 0.5 }))

    expect(display.why).toMatch(/\$0\.5000/)
  })

  test('never rounds a tiny non-zero cost down to a misleading $0.0000', () => {
    const display = describeEntry(entry({ cogs_usd_est: '0.00001' }))

    expect(display.why).not.toMatch(/\$0\.0000\b/)
    expect(display.why).toMatch(/(under|<)\s*\$0\.0001/i)
  })

  test('omits the cost line entirely when cogs is an unparseable value', () => {
    const display = describeEntry(entry({ cogs_usd_est: '' }))

    expect(display.why).not.toMatch(/\$/)
  })
})

describe('describeEntry — never leaks internals', () => {
  const internalsEntry = entry({
    idempotency_key: IDEMPOTENCY_KEY,
    settles_entry_id: '33333333-3333-4333-8333-333333333333',
    meta: { secret: 'sk-live-should-never-render', internal_note: 'do not render me' },
    actor: 'user_2abcDEF',
  })

  function allText(display: ReturnType<typeof describeEntry>): string {
    return [display.label, display.signedAmount, display.why ?? ''].join(' ')
  }

  test.each(LedgerEntryTypeSchema.options)(
    'never renders the idempotency key for %s',
    (entryType) => {
      const display = describeEntry({ ...internalsEntry, entry_type: entryType })

      expect(allText(display)).not.toContain(IDEMPOTENCY_KEY)
      expect(allText(display)).not.toContain('idempotency')
    },
  )

  test.each(LedgerEntryTypeSchema.options)(
    'never renders settles_entry_id, meta or actor for %s',
    (entryType) => {
      const display = describeEntry({ ...internalsEntry, entry_type: entryType })
      const text = allText(display)

      expect(text).not.toContain('33333333-3333-4333-8333-333333333333')
      expect(text).not.toContain('sk-live-should-never-render')
      expect(text).not.toContain('do not render me')
      expect(text).not.toContain('user_2abcDEF')
    },
  )

  test('never renders internal ids even when meta is a raw string blob', () => {
    // `meta` is typed `Record<string, unknown>`; a scalar blob is off-contract,
    // so the cast goes through `unknown` rather than asserting an overlap that
    // does not exist (a direct `as LedgerEntry` does not compile).
    const display = describeEntry({
      ...internalsEntry,
      meta: 'raw-jsonb-blob-with-sk-live-token',
    } as unknown as LedgerEntry)

    expect(allText(display)).not.toContain('raw-jsonb-blob')
  })
})

describe('describeEntry — object reference', () => {
  test('shows the object reference so the row can be traced to its content', () => {
    const display = describeEntry(entry({ object_ref: 'post:8f3a' }))

    expect(display.why).toMatch(/post:8f3a/)
  })

  test('truncates an unreasonably long object reference rather than blowing out the row', () => {
    const display = describeEntry(entry({ object_ref: 'p'.repeat(200) }))

    expect((display.why ?? '').length).toBeLessThan(160)
    expect(display.why).toMatch(/…/)
  })

  test('keeps a reference of exactly the limit intact and clips the very next one', () => {
    // Pins the boundary itself: 'length < 160' would still pass if the cut moved.
    const atLimit = describeEntry(entry({ object_ref: 'p'.repeat(48) }))
    const overLimit = describeEntry(entry({ object_ref: 'p'.repeat(49) }))

    expect(atLimit.why).toContain(`Ref ${'p'.repeat(48)}`)
    expect(atLimit.why).not.toMatch(/…/)
    expect(overLimit.why).toContain(`Ref ${'p'.repeat(48)}…`)
  })

  test('truncates by code point so a clipped emoji never becomes a broken glyph', () => {
    // 'p' + 48 rockets is 49 code points but 97 UTF-16 units. The odd prefix
    // matters: a naive slice(0, 48) lands *inside* the 24th pair and emits a
    // lone high surrogate. (A 2-char prefix would align and hide the bug.)
    // Matches an unpaired high or low surrogate — a *paired* one is a valid
    // emoji and must not trip this.
    const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

    const display = describeEntry(entry({ object_ref: `p${'🚀'.repeat(48)}` }))

    expect(display.why ?? '').not.toMatch(LONE_SURROGATE)
    expect(display.why).toMatch(/…/)
    expect(Array.from(display.why ?? '')).toContain('🚀')
  })

  test('omits the reference when there is none', () => {
    const display = describeEntry(
      entry({ entry_type: 'GRANT', object_ref: null, action_type: null }),
    )

    expect(display.why ?? '').not.toMatch(/ref/i)
  })
})

describe('describeEntry — immutability', () => {
  test('does not mutate the entry it is given', () => {
    const original = entry()
    const snapshot = JSON.stringify(original)

    describeEntry(original)

    expect(JSON.stringify(original)).toBe(snapshot)
  })
})
