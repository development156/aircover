import { describe, expect, it } from 'vitest'
import { computeProration, dunningPolicy } from '@sahoda/billing'
import { PLAN_CATALOG, type SubscriptionView } from '@sahoda/shared'
import {
  count,
  documentLabel,
  DUNNING_LABEL,
  dunningNotice,
  onDate,
  placeOfSupplyLabel,
  planChangeAction,
  planIncludes,
  prorationSummary,
  rupees,
  taxHeads,
} from './plan-copy'

const AUG = {
  start: new Date('2026-08-01T00:00:00.000Z'),
  end: new Date('2026-09-01T00:00:00.000Z'),
}
const MID_AUG = new Date('2026-08-16T12:00:00.000Z')

const prorate = (over: Partial<Parameters<typeof computeProration>[0]> = {}) =>
  computeProration({
    fromPlanId: 'starter',
    toPlanId: 'growth',
    periodStart: AUG.start,
    periodEnd: AUG.end,
    now: MID_AUG,
    currentPeriodPaid: true,
    ...over,
  })

const view = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  workspaceId: '00000000-0000-4000-8000-000000000001',
  planId: 'growth',
  status: 'active',
  currentPeriodStart: AUG.start.toISOString(),
  currentPeriodEnd: AUG.end.toISOString(),
  cancelAtPeriodEnd: false,
  pendingPlanId: null,
  pendingPlanEffectiveAt: null,
  graceEndsAt: null,
  dunningAttempts: 0,
  lastFailureAt: null,
  lastFailureCode: null,
  ...over,
})

describe('formatting money', () => {
  it('drops the decimals on a whole rupee amount and keeps them otherwise', () => {
    // A prorated ₹766.59 rounded to ₹767 on screen and charged as ₹766.59 on the card is a
    // discrepancy the customer can see and we cannot explain.
    expect(rupees(49_900)).toBe('₹499')
    expect(rupees(76_659)).toBe('₹766.59')
    expect(rupees(0)).toBe('₹0')
  })

  it('groups by the Indian convention, not the western one', () => {
    expect(count(15_000)).toBe('15,000')
    expect(count(1_500_000)).toBe('15,00,000')
  })

  it('renders a date as a date, never as a relative phrase that goes stale', () => {
    // en-IN abbreviates September as 'Sept', not 'Sep'. Asserting what a reader actually
    // sees rather than what the test author assumed the locale would do.
    expect(onDate('2026-09-01T00:00:00.000Z')).toBe('1 Sept 2026')
  })
})

describe('planIncludes', () => {
  it('states the catalog facts, and pluralises them', () => {
    expect(planIncludes('starter')).toEqual([
      '1,500 credits a month',
      '4 channels',
      '1 site',
      '1 seat',
    ])
  })

  /**
   * §4 of the design system: a quantity that does NOT EXIST gets no slot. Free allows zero
   * sites, and `0 sites` is the exact shape of the `100 of —` defect that rule exists for.
   */
  it('omits a limit of zero rather than rendering "0 sites"', () => {
    const lines = planIncludes('free')
    expect(lines.join(' ')).not.toMatch(/\b0 sites?\b/)
    expect(PLAN_CATALOG.free.limits.sites).toBe(0)
    expect(lines).toEqual(['100 credits a month', '2 channels', '1 seat'])
  })
})

describe('the dunning notice', () => {
  it('renders nothing at all when the subscription is current', () => {
    // "Your payments are fine" is furniture on every screen it appears on.
    expect(dunningNotice(dunningPolicy(view(), MID_AUG), 'growth')).toBeNull()
  })

  it('escalates by fill weight and glyph, never by hue', () => {
    const failedAt = new Date('2026-08-01T00:00:00.000Z')
    const inGrace = dunningPolicy(
      view({
        status: 'past_due',
        lastFailureAt: failedAt.toISOString(),
        graceEndsAt: '2026-08-08T00:00:00.000Z',
      }),
      new Date('2026-08-02T00:00:00.000Z'),
    )
    const suspended = dunningPolicy(
      view({
        status: 'past_due',
        lastFailureAt: failedAt.toISOString(),
        graceEndsAt: '2026-08-08T00:00:00.000Z',
      }),
      new Date('2026-08-09T00:00:00.000Z'),
    )

    const warn = dunningNotice(inGrace, 'growth')
    const stop = dunningNotice(suspended, 'growth')
    expect(warn?.rung).toBe('is-committed')
    expect(stop?.rung).toBe('is-real')
    // Two structural signals move together, so either alone would carry the severity.
    expect(warn?.mark).toBe('!')
    expect(stop?.mark).toBe('!!')
  })

  /**
   * READ THE TEXT. The single most important promise this feature makes is that a failed
   * payment does not take credits the customer already paid for. If that sentence ever
   * stops appearing, the product is telling a different story from the code.
   */
  it('says the credits already held are still spendable, at every stage that renders', () => {
    const failedAt = '2026-08-01T00:00:00.000Z'
    for (const [status, now] of [
      ['past_due', new Date('2026-08-02T00:00:00Z')],
      ['suspended', new Date('2026-08-20T00:00:00Z')],
      ['canceled', new Date('2026-10-20T00:00:00Z')],
    ] as const) {
      const policy = dunningPolicy(
        view({ status, lastFailureAt: failedAt, graceEndsAt: '2026-08-08T00:00:00.000Z' }),
        now,
      )
      const notice = dunningNotice(policy, 'growth')
      expect(notice, status).not.toBeNull()
      expect(notice?.body, status).toMatch(
        /credits you already have are (yours|still yours) to spend/,
      )
      // And it must never claim anything WAS removed. The forbidden thing is the
      // affirmative claim, not the word: "Nothing has been deleted" is the reassurance
      // this feature exists to make, and a blunt /deleted/ ban forbids it — which is how a
      // guard ends up arguing against the guarantee it was written to protect.
      expect(notice?.body, status).not.toMatch(
        /\b(we|sahoda|your \w+) (have|has|was|were) (been )?(deleted|removed)/i,
      )
      expect(notice?.action, status).toBeTruthy()
    }
  })

  it('says nothing was deleted, on the two stages where limits actually drop', () => {
    const policy = dunningPolicy(
      view({
        status: 'suspended',
        lastFailureAt: '2026-08-01T00:00:00.000Z',
        graceEndsAt: '2026-08-08T00:00:00.000Z',
      }),
      new Date('2026-08-20T00:00:00Z'),
    )
    expect(dunningNotice(policy, 'growth')?.body).toMatch(/Nothing has been deleted/)
  })

  it('names a retry date only when one is actually scheduled', () => {
    const exhausted = dunningPolicy(
      view({
        status: 'past_due',
        lastFailureAt: '2026-08-01T00:00:00.000Z',
        graceEndsAt: '2026-08-08T00:00:00.000Z',
        dunningAttempts: 3,
      }),
      new Date('2026-08-02T00:00:00Z'),
    )
    expect(exhausted.nextRetryAt).toBeNull()
    // No dangling "Sahoda tries the card again on ." — the clause is absent, not empty.
    expect(dunningNotice(exhausted, 'growth')?.body).not.toMatch(/tries the card again/)
  })

  it('has a short label for every stage', () => {
    expect(Object.keys(DUNNING_LABEL).sort()).toEqual(
      ['canceled', 'current', 'grace', 'past_due', 'suspended'].sort(),
    )
  })
})

describe('the proration summary — costs shown before spend', () => {
  it('shows the charge, the set-off and the total as separate lines', () => {
    const lines = prorationSummary(prorate())
    expect(lines[0]).toBe('Growth for the rest of this month: ₹749.50.')
    expect(lines[1]).toMatch(/Less the ₹249\.50 of Starter/)
    expect(lines[2]).toBe('You pay ₹500 today, then ₹1,499 a month.')
    expect(lines[3]).toBe('1,750 credits land as soon as the payment clears.')
  })

  it('omits the set-off line when there is nothing to set off', () => {
    // A "₹0 credit" line is a slot with no quantity behind it.
    const lines = prorationSummary(prorate({ currentPeriodPaid: false }))
    expect(lines.join(' ')).not.toMatch(/Less the/)
  })

  it('a downgrade says what the customer keeps, and that nothing is refunded', () => {
    const lines = prorationSummary(prorate({ fromPlanId: 'growth', toPlanId: 'starter' }))
    expect(lines.join(' ')).toMatch(/You keep Growth until 1 Sept 2026/)
    expect(lines.join(' ')).toMatch(/Nothing is charged today and nothing is refunded/)
    // And it must not promise a charge that is not happening.
    expect(lines.join(' ')).not.toMatch(/You pay/)
  })

  it('names the outcome on the button rather than saying "Continue"', () => {
    expect(planChangeAction(prorate())).toBe('Pay ₹500 and switch to Growth')
    expect(planChangeAction(prorate({ fromPlanId: 'growth', toPlanId: 'starter' }))).toBe(
      'Move to Starter on 1 Sept 2026',
    )
    expect(planChangeAction(prorate({ now: new Date('2026-08-31T23:59:00.000Z') }))).toBe(
      'Switch to Growth',
    )
  })

  it('never renders undefined, NaN or an empty amount in any line', () => {
    // Every plan pair, every day of the month, both paid states — read as TEXT.
    const ids = Object.keys(PLAN_CATALOG) as (keyof typeof PLAN_CATALOG)[]
    for (const fromPlanId of ids) {
      for (const toPlanId of ids) {
        for (const paid of [true, false]) {
          for (let day = 0; day <= 31; day += 1) {
            const text = prorationSummary(
              prorate({
                fromPlanId,
                toPlanId,
                currentPeriodPaid: paid,
                now: new Date(AUG.start.getTime() + day * 86_400_000),
              }),
            ).join(' ')
            expect(text, `${fromPlanId}->${toPlanId} d${day}`).not.toMatch(
              /undefined|NaN|Invalid Date|\[object|₹\s|₹$/,
            )
          }
        }
      }
    }
  })
})

describe('invoice copy', () => {
  it('never lets a credit note read like a tax invoice', () => {
    expect(documentLabel({ document_type: 'tax_invoice', reason: null })).toBe('Tax invoice')
    expect(documentLabel({ document_type: 'credit_note', reason: 'chargeback' })).toBe(
      'Credit note (chargeback)',
    )
    expect(documentLabel({ document_type: 'credit_note', reason: 'refund' })).toBe(
      'Credit note (refund)',
    )
  })

  it('names the heads the tax actually landed under', () => {
    expect(taxHeads({ treatment: 'intra_state', rate_percent: 18 })).toBe('CGST + SGST at 18%')
    expect(taxHeads({ treatment: 'inter_state', rate_percent: 18 })).toBe('IGST at 18%')
    // A zero-rated export has no rate to quote — quoting "0%" would describe a different
    // thing from a supply that is zero-RATED.
    expect(taxHeads({ treatment: 'zero_rated_export', rate_percent: 0 })).toBe('Zero-rated export')
  })

  it('renders a place of supply as a place, and never as a bare code', () => {
    expect(placeOfSupplyLabel('27')).toBe('Maharashtra')
    expect(placeOfSupplyLabel('29')).toBe('Karnataka')
    expect(placeOfSupplyLabel('96')).toBe('Outside India')
  })
})
