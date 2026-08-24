import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { PLAN_CATALOG } from '@sahoda/shared'

/**
 * The plan catalog is written down TWICE — as `PLAN_CATALOG` in TypeScript and as
 * rows in `plans` in SQL — and until this file existed nothing read both.
 *
 * That is the shape behind most of the defects this repository has found late:
 * two artifacts each holding half a fact, each internally correct, drifting apart
 * with nothing positioned to notice. `estimated_credits` and `approved_credits`
 * drifted into different units exactly this way.
 *
 * The failure mode here is not abstract. The UI reads `PLAN_CATALOG`, so a
 * customer would be quoted ₹1,999 from TypeScript while entitlements and grants
 * resolved from a `plans` row still saying ₹499 — a wrong price on a real screen
 * and a wrong monthly grant in a real ledger, with every test passing.
 *
 * So this asserts the SQL and the TypeScript agree, by reading the migration file
 * as text. It deliberately does NOT connect to a database: the point is to catch
 * the drift in the diff that causes it, not after a deployment.
 *
 * WHAT THIS GUARD CANNOT SEE, stated because a detector that certifies what it
 * cannot parse is worse than no detector:
 *   · It reads ONE named migration. A later migration that repriced the table
 *     again would leave this file passing while production moved. When you write
 *     the next reprice, repoint REPRICE_MIGRATION at it.
 *   · It parses the literal `update` statements below. It does not execute SQL, so
 *     it proves the file SAYS the right numbers, not that applying it worked.
 *   · It says nothing about Stripe or Cashfree price objects, which are the
 *     amounts a card is actually charged.
 */

const REPRICE_MIGRATION = '20260824200000_reprice_plans_from_business_model_deck.sql'

const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', REPRICE_MIGRATION), 'utf8')

/** The `update plans set … where id = 'x'` statement for one plan, as raw text. */
function statementFor(planId: string): string {
  const match = sql.match(new RegExp(`update plans set[^;]*?where id = '${planId}'`, 's'))
  if (!match) throw new Error(`no update statement for plan '${planId}' in ${REPRICE_MIGRATION}`)
  return match[0]
}

function numberField(statement: string, column: string): number {
  const match = statement.match(new RegExp(`${column} = (\\d+)`))
  if (!match) throw new Error(`no ${column} in: ${statement.slice(0, 60)}…`)
  return Number(match[1])
}

/** Every plan this migration reprices. `free` is not repriced and is not listed. */
const REPRICED = ['starter', 'growth', 'agency'] as const

describe('plans seed parity', () => {
  it.each(REPRICED)('%s costs the same in SQL as in PLAN_CATALOG', (planId) => {
    const statement = statementFor(planId)
    const entry = PLAN_CATALOG[planId]

    expect(numberField(statement, 'price_inr')).toBe(entry.priceInr)
    expect(numberField(statement, 'price_usd')).toBe(entry.priceUsd)
    expect(numberField(statement, 'monthly_credits')).toBe(entry.monthlyCredits)
  })

  it.each(REPRICED)('%s grants the same limits in SQL as in PLAN_CATALOG', (planId) => {
    const statement = statementFor(planId)
    const limits = statement.match(/limits = '(\{.*?\})'::jsonb/s)
    expect(limits, `no limits jsonb for '${planId}'`).not.toBeNull()

    expect(JSON.parse(limits![1] as string)).toEqual(PLAN_CATALOG[planId].limits)
  })

  /**
   * The rename is the half a database migration is easiest to forget, because the
   * price is what everyone checks. A customer seeing "Studio" in the picker and
   * "Agency" on their invoice is the same class of defect as a wrong number.
   */
  it('renames agency to Studio in SQL, matching the catalog label', () => {
    expect(statementFor('agency')).toContain("name = 'Studio'")
    expect(PLAN_CATALOG.agency.name).toBe('Studio')
  })

  /**
   * `free` is the entitlement floor that an unsubscribed or suspended workspace
   * resolves to. If a future reprice starts touching it, that is an access-control
   * change and it must be a deliberate one, not a line that rode along with a
   * pricing edit.
   */
  it('leaves the free plan alone', () => {
    expect(sql).not.toMatch(/where id = 'free'/)
    expect(PLAN_CATALOG.free.priceInr).toBe(0)
  })
})
