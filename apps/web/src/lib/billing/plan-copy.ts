import {
  PLAN_CATALOG,
  gstStateName,
  type DunningPolicy,
  type DunningStage,
  type Invoice,
  type PlanId,
  type Proration,
  type TaxTreatment,
} from '@sahoda/shared'
import { creditWord } from '@/lib/credit-words'
import { DEFAULT_ZONE } from '@/lib/time/zone'

/**
 * Every sentence and every formatted number the plan screen renders.
 *
 * Pulled out of the components on purpose: the components are the part that cannot be
 * tested by reading text, and the text is the part that has actually been wrong. Run 13's
 * regression checked every width, offset and overflow flag, went green, and shipped a rail
 * rendering the literal string `"S Sah"` — so the copy lives here, where a test can read
 * what a person would read.
 */

/**
 * Money, from PAISE.
 *
 * Whole rupees drop the decimals: `₹499` rather than `₹499.00`. A prorated figure keeps
 * them, because `₹766.59` rounded to `₹767` on the screen and charged as `₹766.59` on the
 * card is a discrepancy the customer can see and we cannot explain.
 */
export function rupees(paise: number): string {
  const whole = paise % 100 === 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100)
}

/** A plain count with Indian grouping — 1,500 credits, 15,000 credits. */
export function count(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n)
}

/** A date a customer is accountable for. Never a relative "in 3 days" — those go stale. */
export function onDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: DEFAULT_ZONE,
  }).format(new Date(iso))
}

/**
 * What a plan includes, as facts from the catalog rather than marketing lines.
 *
 * A limit of ZERO is omitted, never rendered as "0 sites". §4 of the design system: if the
 * quantity does not exist for this plan, the slot should not exist either — `0 of —` is
 * the exact shape of the defect that rule was written for.
 */
export function planIncludes(planId: PlanId): string[] {
  const plan = PLAN_CATALOG[planId]
  const lines = [`${count(plan.monthlyCredits)} ${creditWord(plan.monthlyCredits)} a month`]
  if (plan.limits.channels > 0) lines.push(plural(plan.limits.channels, 'channel'))
  if (plan.limits.sites > 0) lines.push(plural(plan.limits.sites, 'site'))
  if (plan.limits.seats > 0) lines.push(plural(plan.limits.seats, 'seat'))
  return lines
}

function plural(n: number, noun: string): string {
  return `${count(n)} ${noun}${n === 1 ? '' : 's'}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Dunning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The severity ladder, WITHOUT hue.
 *
 * There is no red in this palette and there is not going to be one. Severity is carried by
 * fill weight (the Certainty rung), a glyph, and the words — any one of which survives
 * greyscale, a colour-blind reader and a photocopy.
 *
 * `is-committed` (tint + hairline) for "this will happen unless you act"; `is-real` (solid
 * fill, no edge) for "this has happened". A suspended account is not a warning about the
 * future, it is a description of the present, so it moves up the ladder rather than
 * changing colour.
 */
export interface DunningNotice {
  /** Certainty class from tokens.css. Fill weight IS the severity. */
  rung: 'is-committed' | 'is-real'
  /** Structural mark, so severity survives greyscale. */
  mark: '!' | '!!'
  title: string
  body: string
  /** What the customer can do. Always something they can actually do. */
  action: string
}

export function dunningNotice(policy: DunningPolicy, planId: PlanId): DunningNotice | null {
  const planName = PLAN_CATALOG[planId].name
  const ends = policy.stageEndsAt

  switch (policy.stage) {
    case 'current':
      // Nothing renders. A banner saying "your payments are fine" is furniture on every
      // screen it appears on.
      return null

    case 'past_due':
    case 'grace':
      return {
        rung: 'is-committed',
        mark: '!',
        title: 'Your last payment did not go through',
        body:
          `Your ${planName} plan is still running${ends ? ` until ${onDate(ends)}` : ''}, ` +
          `and the credits you already have are yours to spend either way. ` +
          `What stops is next month's credits.` +
          (policy.nextRetryAt
            ? ` Sahoda tries the card again on ${onDate(policy.nextRetryAt)}.`
            : ''),
        action: 'Pay now',
      }

    case 'suspended':
      return {
        rung: 'is-real',
        mark: '!!',
        title: `Your ${planName} plan is suspended`,
        body:
          'Your workspace is on the free plan’s limits for now. Nothing has been deleted. ' +
          'every channel, site and post is still here, and the credits you already have are ' +
          'still yours to spend. Paying restores the plan straight away.',
        action: 'Pay now',
      }

    case 'canceled':
      return {
        rung: 'is-real',
        mark: '!!',
        title: 'Your plan is closed',
        body:
          'Your workspace runs on the free plan. Nothing has been deleted, and the credits ' +
          'you already have are still yours to spend. You can start a plan again whenever ' +
          'you want to.',
        action: 'Choose a plan',
      }
  }
}

/** A short, plain label for the stage. Used where a sentence would be too much. */
export const DUNNING_LABEL: Record<DunningStage, string> = {
  current: 'Active',
  past_due: 'Payment failed',
  grace: 'Payment failed',
  suspended: 'Suspended',
  canceled: 'Closed',
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan changes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What pressing the button will do, said before it is pressed.
 *
 * "Costs shown before spend" is a non-negotiable, and a plan change is the one place in
 * this product where the amount is not a fixed catalogue price — so it is spelled out with
 * the arithmetic visible rather than as a single unexplained total.
 */
export function prorationSummary(p: Proration): string[] {
  const to = PLAN_CATALOG[p.toPlanId].name

  if (p.kind === 'same') return [`You are already on ${to}.`]

  if (p.kind === 'downgrade') {
    return [
      `You keep ${PLAN_CATALOG[p.fromPlanId].name} until ${onDate(p.effectiveAt)}, ` +
        `with everything it includes.`,
      `${to} starts on ${onDate(p.effectiveAt)}. Nothing is charged today and nothing is refunded. ` +
        `you have already paid for this month and you keep all of it.`,
    ]
  }

  const lines = [`${to} for the rest of this month: ${rupees(p.remainderChargePaise)}.`]
  // Only stated when it exists. A "₹0 credit" line is a slot with no quantity behind it.
  if (p.unusedCreditPaise > 0) {
    lines.push(
      `Less the ${rupees(p.unusedCreditPaise)} of ${PLAN_CATALOG[p.fromPlanId].name} ` +
        `you have already paid for and will not use.`,
    )
  }
  lines.push(
    p.amountDuePaise === 0
      ? 'Nothing to pay today.'
      : `You pay ${rupees(p.amountDuePaise)} today, then ${rupees(PLAN_CATALOG[p.toPlanId].priceInr * 100)} a month.`,
  )
  if (p.creditsGranted > 0) {
    lines.push(
      `${count(p.creditsGranted)} ${creditWord(p.creditsGranted)} land as soon as the payment clears.`,
    )
  }
  return lines
}

/** The label on the button, so it names the outcome rather than saying "Continue". */
export function planChangeAction(p: Proration): string {
  if (p.kind === 'same') return 'Keep this plan'
  const to = PLAN_CATALOG[p.toPlanId].name
  if (p.kind === 'downgrade') return `Move to ${to} on ${onDate(p.effectiveAt)}`
  return p.amountDuePaise === 0
    ? `Switch to ${to}`
    : `Pay ${rupees(p.amountDuePaise)} and switch to ${to}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoices
// ─────────────────────────────────────────────────────────────────────────────

const TREATMENT_LABEL: Record<TaxTreatment, string> = {
  intra_state: 'CGST + SGST',
  inter_state: 'IGST',
  zero_rated_export: 'Zero-rated export',
}

/** How the tax on one document was split, named the way the document names it. */
export function taxHeads(invoice: Pick<Invoice, 'treatment' | 'rate_percent'>): string {
  const label = TREATMENT_LABEL[invoice.treatment]
  return invoice.treatment === 'zero_rated_export' ? label : `${label} at ${invoice.rate_percent}%`
}

/** Where the supply landed, as a place rather than a code. */
export function placeOfSupplyLabel(code: string): string {
  if (code === '96') return 'Outside India'
  return gstStateName(code) ?? code
}

/** A tax invoice and a credit note are different documents and must never read alike. */
export function documentLabel(invoice: Pick<Invoice, 'document_type' | 'reason'>): string {
  if (invoice.document_type === 'tax_invoice') return 'Tax invoice'
  return invoice.reason === 'chargeback' ? 'Credit note (chargeback)' : 'Credit note (refund)'
}
