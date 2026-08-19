import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { PLAN_CATALOG, getEntitlements, type SubscriptionView } from '@sahoda/shared'
import { LIVE_DB_URL } from './test-helpers/live-env'
import { createPgLedgerPort, type PgLedgerPort } from './ledger/pg'
import { computeProration } from './plans/proration'
import { downgradeImpact } from './plans/downgradeImpact'
import { dunningPolicy, advanceStage, graceEndsAt } from './dunning/dunning'
import { createApplyReversal } from './reversals/applyReversal'
import { createApplyPlanGrant } from './webhooks/applyPlanGrant'
import type { ParsedWebhookEvent } from './providers/types'

/**
 * The plan lifecycle against a REAL Postgres: upgrade, downgrade, dunning, chargeback.
 *
 * ── WHY THESE ARE NOT THE UNIT TESTS AGAIN ───────────────────────────────────
 * `proration.test.ts`, `dunning.test.ts` and `applyReversal.test.ts` already prove the
 * arithmetic and the branching against fakes, and that is the right level for both. What
 * a fake cannot decide is what the DATABASE does — and the database is where every one of
 * these features actually lives or fails:
 *
 *   · a clamped reversal is clamped against `balance_held_le_total`, a CHECK constraint
 *   · "nothing is deleted" is a claim about rows that still exist afterwards
 *   · "credits are never clawed back" is a claim about `credit_balances` across four
 *     status transitions, and a fake balance agrees with whatever the test asserts
 *
 * So every number below is READ BACK, and read back from `credit_balances` — the
 * projection `app.apply_ledger_entry` maintains — rather than from the value a function
 * returned about its own work.
 *
 * Gated on LIVE_DB_URL exactly like its sibling suites. See `packages/db/scripts/pgbox.mjs`.
 */
describe.skipIf(!LIVE_DB_URL)('the plan lifecycle against the real ledger', () => {
  let ledger: PgLedgerPort
  let ws: string

  beforeAll(() => {
    ledger = createPgLedgerPort({ connectionString: LIVE_DB_URL })
  })
  afterAll(async () => {
    await ledger.close()
  })

  beforeEach(async () => {
    const r = await ledger.pool.query<{ id: string }>(
      `insert into workspaces (name, slug, created_by)
       values ('lifecycle-it', 'lc-it-' || replace(gen_random_uuid()::text, '-', ''), 'user_lc_it')
       returning id`,
    )
    ws = r.rows[0]!.id
  })
  afterEach(async () => {
    await ledger.pool.query('delete from workspaces where id = $1', [ws])
  })

  /** The materialized balance, read from the projection rather than from a return value. */
  async function balance(): Promise<{ total: number; held: number }> {
    const r = await ledger.pool.query<{ balance_total: number; balance_held: number }>(
      `select balance_total, balance_held from credit_balances where workspace_id = $1`,
      [ws],
    )
    const row = r.rows[0]
    return row
      ? { total: Number(row.balance_total), held: Number(row.balance_held) }
      : { total: 0, held: 0 }
  }

  async function entryRows(): Promise<Array<{ entry_type: string; amount: number }>> {
    const r = await ledger.pool.query<{ entry_type: string; amount: number }>(
      `select entry_type, amount from credit_ledger where workspace_id = $1 order by seq`,
      [ws],
    )
    return r.rows.map((x) => ({ entry_type: x.entry_type, amount: Number(x.amount) }))
  }

  /** Put real credits on the workspace, through the only write path there is. */
  async function grant(amount: number, key = `test:${randomUUID()}`): Promise<void> {
    await ledger.apply({
      workspaceId: ws,
      entryType: 'GRANT',
      amount,
      idempotencyKey: key,
      actor: 'test',
    })
  }

  /** Spend credits the way the app does: a HOLD settled by a DEBIT. */
  async function spend(amount: number): Promise<void> {
    const ref = `obj:${randomUUID()}`
    const hold = await ledger.apply({
      workspaceId: ws,
      entryType: 'HOLD',
      amount,
      idempotencyKey: `hold:${ref}`,
      objectRef: ref,
      actor: 'test',
    })
    await ledger.apply({
      workspaceId: ws,
      entryType: 'DEBIT',
      amount,
      idempotencyKey: `debit:${ref}`,
      objectRef: ref,
      settlesEntryId: hold.entry.id,
      actor: 'test',
    })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UPGRADE — every rounding to the customer, and the grant keyed on the change
  // ───────────────────────────────────────────────────────────────────────────

  describe('an upgrade', () => {
    const periodStart = new Date('2026-07-01T00:00:00.000Z')
    const periodEnd = new Date('2026-08-01T00:00:00.000Z')
    // Mid-period, and deliberately a date that does NOT divide the period evenly — a
    // rounding rule can only be observed where there is something to round.
    const now = new Date('2026-07-16T09:41:00.000Z')

    const proration = () =>
      computeProration({
        fromPlanId: 'starter',
        toPlanId: 'growth',
        periodStart,
        periodEnd,
        now,
        currentPeriodPaid: true,
      })

    it('rounds the charge DOWN, the set-off UP and the credits UP — each one the customer’s way', () => {
      const p = proration()
      const bp = p.unusedBasisPoints
      expect(bp).toBeGreaterThan(0)
      expect(bp).toBeLessThan(10_000)

      const exactCharge = (PLAN_CATALOG.growth.priceInr * 100 * bp) / 10_000
      const exactSetOff = (PLAN_CATALOG.starter.priceInr * 100 * bp) / 10_000
      const exactCredits =
        ((PLAN_CATALOG.growth.monthlyCredits - PLAN_CATALOG.starter.monthlyCredits) * bp) / 10_000

      // Not `toBe(Math.floor(...))` alone: that would also pass if the exact value were a
      // whole number and nothing was rounded at all. The inequality is the guarantee.
      expect(exactCharge % 1).not.toBe(0)
      expect(p.remainderChargePaise).toBe(Math.floor(exactCharge))
      expect(p.remainderChargePaise).toBeLessThan(exactCharge)

      expect(exactSetOff % 1).not.toBe(0)
      expect(p.unusedCreditPaise).toBe(Math.ceil(exactSetOff))
      expect(p.unusedCreditPaise).toBeGreaterThan(exactSetOff)

      expect(exactCredits % 1).not.toBe(0)
      expect(p.creditsGranted).toBe(Math.ceil(exactCredits))
      expect(p.creditsGranted).toBeGreaterThan(exactCredits)

      expect(p.amountDuePaise).toBe(p.remainderChargePaise - p.unusedCreditPaise)
      expect(p.immediate).toBe(true)
    })

    it('grants the prorated credits once, on the change id, and the balance reads back', async () => {
      const p = proration()
      const changeId = `chg_${randomUUID()}`
      const apply = createApplyPlanGrant(ledger)

      const event: ParsedWebhookEvent = {
        provider: 'cashfree',
        eventId: `PAYMENT_SUCCESS_WEBHOOK:${randomUUID()}`,
        eventType: 'payment_succeeded',
        workspaceId: ws,
        planId: 'growth',
        period: '2026-07',
        mode: 'sandbox',
        planChange: { changeId, credits: p.creditsGranted },
        raw: {},
      }

      const first = await apply(event)
      expect(first.ok).toBe(true)
      expect(first.ok && first.data.replayed).toBe(false)

      // The same change delivered again — a redelivery, not a second upgrade.
      const again = await apply(event)
      expect(again.ok && again.data.replayed).toBe(true)

      expect(await entryRows()).toEqual([{ entry_type: 'GRANT', amount: p.creditsGranted }])
      expect(await balance()).toEqual({ total: p.creditsGranted, held: 0 })
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // DOWNGRADE — at the boundary, and nothing is ever deleted
  // ───────────────────────────────────────────────────────────────────────────

  describe('a downgrade', () => {
    const periodStart = new Date('2026-07-01T00:00:00.000Z')
    const periodEnd = new Date('2026-08-01T00:00:00.000Z')
    const now = new Date('2026-07-16T09:41:00.000Z')

    it('never takes effect immediately — it lands on the period boundary already paid for', () => {
      const p = computeProration({
        fromPlanId: 'growth',
        toPlanId: 'starter',
        periodStart,
        periodEnd,
        now,
        currentPeriodPaid: true,
      })

      expect(p.kind).toBe('downgrade')
      expect(p.immediate).toBe(false)
      expect(p.effectiveAt).toBe(periodEnd.toISOString())
      // Nothing is charged and nothing is granted for a downgrade.
      expect(p.remainderChargePaise).toBe(0)
      expect(p.unusedCreditPaise).toBe(0)
      expect(p.creditsGranted).toBe(0)
      expect(p.amountDuePaise).toBe(0)
    })

    it('parks the intent without moving the live plan, and touches no ledger row', async () => {
      await grant(PLAN_CATALOG.growth.monthlyCredits)
      const before = await balance()

      await ledger.pool.query(
        `insert into subscriptions
           (workspace_id, plan_id, status, provider, current_period_start, current_period_end)
         values ($1, 'growth', 'active', 'cashfree', $2, $3)`,
        [ws, periodStart.toISOString(), periodEnd.toISOString()],
      )
      await ledger.pool.query(
        `update subscriptions
            set pending_plan_id = 'starter', pending_plan_effective_at = $2
          where workspace_id = $1`,
        [ws, periodEnd.toISOString()],
      )

      const r = await ledger.pool.query<{
        plan_id: string
        pending_plan_id: string
        pending_plan_effective_at: Date
      }>(
        `select plan_id, pending_plan_id, pending_plan_effective_at
           from subscriptions where workspace_id = $1`,
        [ws],
      )

      // The LIVE plan is untouched. A downgrade that moved it now would strip
      // entitlements the customer has already paid for.
      expect(r.rows[0]!.plan_id).toBe('growth')
      expect(r.rows[0]!.pending_plan_id).toBe('starter')
      expect(new Date(r.rows[0]!.pending_plan_effective_at).toISOString()).toBe(
        periodEnd.toISOString(),
      )

      // And the credits are exactly where they were.
      expect(await balance()).toEqual(before)
      expect(await entryRows()).toHaveLength(1)
    })

    it('reports what is over the new limit while deleting none of it', () => {
      // Five channels on Growth (limit 8) dropping to Starter (limit 4).
      const usage = { channels: 5, sites: 2, seats: 1 }
      const impact = downgradeImpact({ toPlanId: 'starter', effectiveAt: periodEnd, usage })

      expect(impact.nothingIsDeleted).toBe(true)
      expect(impact.blocksNewCreates).toBe(true)
      expect(impact.over).toEqual([
        { dimension: 'channels', have: 5, allowed: getEntitlements('starter').channels },
        { dimension: 'sites', have: 2, allowed: getEntitlements('starter').sites },
      ])
      // The limit binds NEW creates. It never counts down what already exists.
      expect(impact.over.every((o) => o.have > o.allowed)).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // DUNNING — past_due → grace → suspended → canceled, and the credits stay put
  // ───────────────────────────────────────────────────────────────────────────

  describe('dunning', () => {
    const firstFailure = new Date('2026-07-10T00:00:00.000Z')

    function view(
      status: SubscriptionView['status'],
      graceEnds: Date | null = graceEndsAt(firstFailure),
    ): SubscriptionView {
      return {
        workspaceId: ws,
        planId: 'growth',
        status,
        currentPeriodStart: '2026-07-01T00:00:00.000Z',
        currentPeriodEnd: '2026-08-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        pendingPlanId: null,
        pendingPlanEffectiveAt: null,
        graceEndsAt: graceEnds ? graceEnds.toISOString() : null,
        dunningAttempts: 0,
        lastFailureAt: firstFailure.toISOString(),
        lastFailureCode: null,
      }
    }

    it('walks past_due → grace → suspended → canceled on the clock alone', () => {
      const grace = graceEndsAt(firstFailure)

      // Inside the grace window.
      expect(advanceStage(view('past_due'), new Date(grace.getTime() - 1))).toBe('grace')
      // The moment it closes.
      expect(advanceStage(view('grace'), grace)).toBe('suspended')
      // Thirty days after grace ended.
      const closes = new Date(grace.getTime() + 30 * 86_400_000)
      expect(advanceStage(view('suspended'), new Date(closes.getTime() - 1))).toBe('suspended')
      expect(advanceStage(view('suspended'), closes)).toBe('canceled')

      // A missing grace timestamp is OUR gap and must never cost a customer their plan.
      expect(advanceStage(view('past_due', null), new Date('2030-01-01T00:00:00.000Z'))).toBe(
        'past_due',
      )
    })

    it('drops entitlements to Free at suspension — the floor, never below it', () => {
      const grace = graceEndsAt(firstFailure)
      const after = new Date(grace.getTime() + 1)

      expect(dunningPolicy(view('past_due'), new Date(grace.getTime() - 1)).effectivePlanId).toBe(
        'growth',
      )
      expect(dunningPolicy(view('grace'), new Date(grace.getTime() - 1)).effectivePlanId).toBe(
        'growth',
      )
      expect(dunningPolicy(view('suspended'), after).effectivePlanId).toBe('free')
      expect(dunningPolicy(view('canceled'), after).effectivePlanId).toBe('free')

      // Free is the floor: there is no plan below it, and a suspended workspace is
      // limited, never unusable.
      const suspended = dunningPolicy(view('suspended'), after)
      expect(getEntitlements(suspended.effectivePlanId).channels).toBe(
        PLAN_CATALOG.free.limits.channels,
      )
      expect(suspended.monthlyGrantRuns).toBe(false)
    })

    it('claws back NOTHING at any stage — the balance is identical through all four', async () => {
      await grant(PLAN_CATALOG.growth.monthlyCredits)
      await spend(1200)
      const afterSpending = await balance()
      const entriesBefore = await entryRows()

      const grace = graceEndsAt(firstFailure)
      const stages: Array<[SubscriptionView['status'], Date]> = [
        ['past_due', new Date(grace.getTime() - 1)],
        ['grace', new Date(grace.getTime() - 1)],
        ['suspended', new Date(grace.getTime() + 1)],
        ['canceled', new Date(grace.getTime() + 40 * 86_400_000)],
      ]

      for (const [status, at] of stages) {
        const policy = dunningPolicy(view(status), at)
        // The literal `true` in the contract, exercised at every stage rather than read.
        expect(policy.existingCreditsSpendable).toBe(true)

        await ledger.pool.query(
          `insert into subscriptions (workspace_id, plan_id, status, provider)
             values ($1, 'growth', $2, 'cashfree')
           on conflict (workspace_id) where status in ('trialing','active','past_due','grace')
             do update set status = excluded.status`,
          [ws, status],
        )
        await ledger.pool.query(`update subscriptions set status = $2 where workspace_id = $1`, [
          ws,
          status,
        ])

        // Read back after every transition, not once at the end: a claw-back that
        // happened and was undone would still be a claw-back.
        expect(await balance()).toEqual(afterSpending)
        expect(await entryRows()).toEqual(entriesBefore)
      }

      // And the credits are still SPENDABLE, not merely present.
      await spend(100)
      expect((await balance()).total).toBe(afterSpending.total - 100)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // CHARGEBACK — a compensating entry, clamped, with the remainder as a receivable
  // ───────────────────────────────────────────────────────────────────────────

  describe('a chargeback', () => {
    it('is a NEW compensating entry — the entries it reverses are untouched', async () => {
      await grant(1500)
      const before = await entryRows()

      const reverse = createApplyReversal({ ledger })
      const res = await reverse({
        workspaceId: ws,
        kind: 'chargeback',
        reference: `dispute_${randomUUID()}`,
        credits: 1500,
        actor: 'provider:cashfree',
      })

      expect(res.ok).toBe(true)
      const after = await entryRows()
      // Append-only: the original rows are still there, byte for byte, with a new row
      // after them. Nothing was edited, because nothing CAN be.
      expect(after.slice(0, before.length)).toEqual(before)
      expect(after[after.length - 1]).toEqual({ entry_type: 'ADJUST', amount: -1500 })
      expect(await balance()).toEqual({ total: 0, held: 0 })
    })

    it('CLAMPS to available and reports the rest as a receivable, instead of writing nothing', async () => {
      await grant(1500)
      await spend(1300) // 200 left

      const reverse = createApplyReversal({ ledger })
      const res = await reverse({
        workspaceId: ws,
        kind: 'chargeback',
        reference: `dispute_${randomUUID()}`,
        credits: 1500,
        actor: 'provider:cashfree',
      })

      expect(res.ok).toBe(true)
      if (!res.ok) return

      // The measurement this design exists for: an unclamped -1500 violates
      // balance_held_le_total, aborts the transaction, and the chargeback becomes
      // INVISIBLE. Clamped, it is recorded — and the remainder is named.
      expect(res.data.reversedCredits).toBe(200)
      expect(res.data.shortfallCredits).toBe(1300)
      expect(res.data.reversedCredits + res.data.shortfallCredits).toBe(res.data.requestedCredits)
      expect(res.data.entryId).not.toBeNull()

      expect(await balance()).toEqual({ total: 0, held: 0 })
      const rows = await entryRows()
      expect(rows[rows.length - 1]).toEqual({ entry_type: 'ADJUST', amount: -200 })
    })

    it('records the shortfall on a CREDIT NOTE, in its own series, as money owed', async () => {
      await grant(1500)
      await spend(1300)

      const reverse = createApplyReversal({ ledger })
      const res = await reverse({
        workspaceId: ws,
        kind: 'chargeback',
        reference: `dispute_${randomUUID()}`,
        credits: 1500,
        actor: 'provider:cashfree',
      })
      expect(res.ok).toBe(true)
      if (!res.ok) return

      const paymentId = `pay_${randomUUID()}`
      const invoice = await issueInvoice({
        documentType: 'tax_invoice',
        grossPaise: 149900,
        providerPaymentId: paymentId,
      })

      const note = await issueInvoice({
        documentType: 'credit_note',
        grossPaise: 149900,
        providerPaymentId: `${paymentId}_cn`,
        referencesInvoiceId: invoice.id,
        reason: 'chargeback',
        shortfallCredits: res.data.shortfallCredits,
      })

      expect(note.document_type).toBe('credit_note')
      expect(Number(note.shortfall_credits)).toBe(1300)
      // Its own prefix AND its own counter row — see the serial assertions below.
      expect(note.serial.startsWith('SLC/')).toBe(true)
      expect(invoice.serial.startsWith('SL/')).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // The statutory serial — two SERIES, not one counter with two prefixes
  // ───────────────────────────────────────────────────────────────────────────

  interface IssuedInvoice {
    id: string
    serial: string
    serial_seq: number
    document_type: string
    shortfall_credits: number
  }

  /**
   * Issue through `app.issue_invoice`, the only write path to `invoices`.
   *
   * The supplier fields below are FIXTURE values for a test, never a default the product
   * could fall back on: `loadGstSupplierConfig` has no defaults precisely because inventing
   * a GSTIN would fabricate a statutory record. The GSTIN used here is the published
   * checksum-valid sample that @sahoda/shared is already pinned to.
   */
  async function issueInvoice(opts: {
    documentType: 'tax_invoice' | 'credit_note'
    grossPaise: number
    providerPaymentId: string
    referencesInvoiceId?: string
    reason?: 'refund' | 'chargeback'
    shortfallCredits?: number
    financialYear?: string
  }): Promise<IssuedInvoice> {
    const gross = opts.grossPaise
    // 18% inclusive, split into equal intra-state halves so the CHECK constraints hold.
    const taxable = Math.round((gross * 100) / 118)
    const tax = gross - taxable
    const half = Math.floor(tax / 2)
    // The halves must be EQUAL and the lines must add to the gross; the odd paisa goes
    // to the taxable base rather than breaking either constraint.
    const cgst = half
    const sgst = half
    const taxableAdjusted = gross - cgst - sgst

    const r = await ledger.pool.query<{ res: { invoice: IssuedInvoice } }>(
      `select app.issue_invoice(
         $1, $2, $3, $4, '998314',
         'Sahoda Labs Test Supplier', '27AAPFU0939F1ZV', '27',
         'Test Recipient', null, '27', 'IN',
         '27', 'intra_state', 18,
         $5, $6, $7, $8, 0,
         false, false,
         '2026-07', 'growth',
         $9, $10, $11,
         'cashfree', null, $12, null, null
       ) as res`,
      [
        ws,
        opts.documentType,
        opts.financialYear ?? '26-27',
        opts.documentType === 'credit_note' ? 'SLC' : 'SL',
        gross,
        taxableAdjusted,
        cgst,
        sgst,
        opts.referencesInvoiceId ?? null,
        opts.reason ?? null,
        opts.shortfallCredits ?? 0,
        opts.providerPaymentId,
      ],
    )
    return r.rows[0]!.res.invoice
  }

  describe('the invoice serial', () => {
    afterEach(async () => {
      // The counter is global, not per-workspace, so it must be reset between the
      // assertions below or a rerun reads yesterday's numbers.
      await ledger.pool.query(`delete from invoice_serials where financial_year like 'zz-%'`)
    })

    it('runs the two document types on SEPARATE counters, not one counter with two prefixes', async () => {
      const fy = `zz-${Math.floor(Math.random() * 90 + 10)}`

      const i1 = await issueInvoice({
        documentType: 'tax_invoice',
        grossPaise: 149900,
        providerPaymentId: `p_${randomUUID()}`,
        financialYear: fy,
      })
      const i2 = await issueInvoice({
        documentType: 'tax_invoice',
        grossPaise: 149900,
        providerPaymentId: `p_${randomUUID()}`,
        financialYear: fy,
      })
      const n1 = await issueInvoice({
        documentType: 'credit_note',
        grossPaise: 149900,
        providerPaymentId: `p_${randomUUID()}`,
        financialYear: fy,
        referencesInvoiceId: i1.id,
        reason: 'refund',
      })

      expect(i1.serial_seq).toBe(1)
      expect(i2.serial_seq).toBe(2)
      // THE assertion. On one shared counter this would be 3, and the tax-invoice series
      // would have a hole at 3 that a tax officer would ask about.
      expect(n1.serial_seq).toBe(1)

      const counters = await ledger.pool.query<{ document_type: string; next_seq: number }>(
        `select document_type, next_seq from invoice_serials
          where financial_year = $1 order by document_type`,
        [fy],
      )
      // Two ROWS — separate counters, which is what "separate series" has to mean.
      expect(counters.rows).toEqual([
        { document_type: 'credit_note', next_seq: 2 },
        { document_type: 'tax_invoice', next_seq: 3 },
      ])
    })

    it('burns no number when the issue is rolled back — which a sequence would', async () => {
      const fy = `zz-${Math.floor(Math.random() * 90 + 10)}`
      await issueInvoice({
        documentType: 'tax_invoice',
        grossPaise: 149900,
        providerPaymentId: `p_${randomUUID()}`,
        financialYear: fy,
      })

      const client = await ledger.pool.connect()
      try {
        await client.query('begin')
        // Issue inside a transaction, then abandon it. A Postgres SEQUENCE would have
        // consumed the number here: nextval is deliberately non-transactional. A counter
        // row locked FOR UPDATE rolls back with everything else.
        await client.query(
          `select app.issue_invoice(
             $1, 'tax_invoice', $2, 'SL', '998314',
             'S', '27AAPFU0939F1ZV', '27', 'R', null, '27', 'IN',
             '27', 'intra_state', 18,
             100, 100, 0, 0, 0, false, false,
             null, null, null, null, 0, 'cashfree', null, $3, null, null)`,
          [ws, fy, `p_${randomUUID()}`],
        )
        await client.query('rollback')
      } finally {
        client.release()
      }

      const next = await issueInvoice({
        documentType: 'tax_invoice',
        grossPaise: 149900,
        providerPaymentId: `p_${randomUUID()}`,
        financialYear: fy,
      })

      // 2, not 3. The abandoned issue left no gap — which is the whole statutory
      // requirement: invoice numbers must be CONSECUTIVE within a financial year.
      expect(next.serial_seq).toBe(2)
      expect(next.serial).toBe(`SL/${fy}/000002`)
    })
  })
})
