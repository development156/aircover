import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { openDbUnderTest, type DbUnderTest } from '../test-helpers/db-under-test'
import { PLAN_CATALOG, PlanLimitsSchema, type PlanId } from '@sahoda/shared'
import { createPgPlanResolver, type PgPlanResolver } from './pg'
import { createCheckEntitlement } from './checkEntitlement'

/**
 * Ported off `describe.skipIf(!LIVE_DB_URL)` on 2026-08-20.
 *
 * The skip meant these had NEVER executed: the only DSN the repo has is
 * production's and the opt-in guarding it is off by default and should stay off.
 * `vitest --reporter=json` reported packages/billing as 270 passed / 26 SKIPPED,
 * and vitest reports a suite that ran nothing exactly as it reports one that
 * passed. They now run against PGlite built from packages/db's real migration
 * files, and against the live database when SAHODA_ALLOW_LIVE_TESTS=1.
 */
describe('entitlements against the real database', () => {
  let db: DbUnderTest
  let resolver: PgPlanResolver
  let ws: string

  beforeAll(async () => {
    db = await openDbUnderTest()
    resolver = createPgPlanResolver({
      connectionString: db.connectionString,
      ...(db.kind === 'pglite' ? { pool: db.pool } : {}),
    })
  })
  afterAll(async () => {
    await resolver.close()
    await db.close()
  })

  it('is running against a real Postgres, and says which one', () => {
    expect(['pglite', 'live']).toContain(db.kind)
  })
  beforeEach(async () => {
    const r = await resolver.pool.query<{ id: string }>(
      `insert into workspaces (name, slug, created_by)
       values ('billing-ent-it', 'ent-it-' || replace(gen_random_uuid()::text, '-', ''), 'user_ent_it')
       returning id`,
    )
    ws = r.rows[0]!.id
  })
  afterEach(async () => {
    if (ws) await resolver.pool.query('delete from workspaces where id = $1', [ws])
  })

  const subscribe = async (planId: PlanId, status: string): Promise<void> => {
    await resolver.pool.query(
      `insert into subscriptions (workspace_id, plan_id, status, provider)
       values ($1, $2, $3, 'cashfree')`,
      [ws, planId, status],
    )
  }

  describe('plan resolution', () => {
    it('resolves a workspace with no subscription row to free', async () => {
      expect(await resolver.resolvePlanId(ws)).toBe('free')
    })

    it('resolves an active subscription to its plan', async () => {
      await subscribe('growth', 'active')
      expect(await resolver.resolvePlanId(ws)).toBe('growth')
    })

    it.each(['trialing', 'past_due', 'grace'])('treats %s as live', async (status) => {
      await subscribe('starter', status)
      expect(await resolver.resolvePlanId(ws)).toBe('starter')
    })

    /**
     * The reason this filters on the live status set instead of taking the newest row:
     * 'canceled' and 'suspended' sit outside the subscriptions_one_live partial unique index,
     * so they accumulate. An ORDER BY created_at resolver would hand back agency entitlements
     * to a workspace whose agency plan was canceled.
     */
    it.each(['canceled', 'suspended'])('falls back to free for a %s row', async (status) => {
      await subscribe('agency', status)
      expect(await resolver.resolvePlanId(ws)).toBe('free')
    })

    it('ignores a dead row and honours the live one', async () => {
      await subscribe('agency', 'canceled')
      await subscribe('starter', 'active')
      expect(await resolver.resolvePlanId(ws)).toBe('starter')
    })

    it('resolves an unknown workspace id to free rather than throwing', async () => {
      const orphan = '00000000-0000-0000-0000-0000000000ff'
      expect(await resolver.resolvePlanId(orphan)).toBe('free')
    })
  })

  describe('the gate end to end', () => {
    it('denies a site on free, which has none', async () => {
      const check = createCheckEntitlement(resolver)

      const result = await check({ workspaceId: ws, dimension: 'sites', currentUsage: 0 })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected err')
      expect(result.error.code).toBe('ENTITLEMENT_ERROR')
    })

    it('allows the same site once the workspace is on growth', async () => {
      await subscribe('growth', 'active')
      const check = createCheckEntitlement(resolver)

      const result = await check({ workspaceId: ws, dimension: 'sites', currentUsage: 0 })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.data.planId).toBe('growth')
      expect(result.data.limit).toBe(PLAN_CATALOG.growth.limits.sites)
    })

    it('denies once growth has consumed its sites', async () => {
      await subscribe('growth', 'active')
      const check = createCheckEntitlement(resolver)

      const result = await check({ workspaceId: ws, dimension: 'sites', currentUsage: 3 })

      expect(result.ok).toBe(false)
    })
  })
})

/**
 * DB↔code drift guard.
 *
 * `plans.limits` is a seeded fold of PLAN_CATALOG, and the gate reads the catalog rather than
 * the column. That is only safe if the two genuinely agree — and nothing asserted it before,
 * so a hand-edited row or a stale seed could silently make the DB and the product disagree
 * about what a customer paid for. This test is what makes reading the catalog honest.
 */
describe('plans table matches PLAN_CATALOG', () => {
  let db: DbUnderTest
  let resolver: PgPlanResolver

  beforeAll(async () => {
    db = await openDbUnderTest()
    resolver = createPgPlanResolver({
      connectionString: db.connectionString,
      ...(db.kind === 'pglite' ? { pool: db.pool } : {}),
    })
  })
  afterAll(async () => {
    await resolver.close()
    await db.close()
  })

  it('has exactly the catalog plans, with matching credits, prices and limits', async () => {
    const r = await resolver.pool.query<{
      id: string
      name: string
      monthly_credits: number
      price_inr: number
      price_usd: number
      limits: unknown
    }>('select id, name, monthly_credits, price_inr, price_usd, limits from plans order by id')

    const rows = Object.fromEntries(r.rows.map((row) => [row.id, row]))
    expect(Object.keys(rows).sort()).toEqual(Object.keys(PLAN_CATALOG).sort())

    for (const [planId, entry] of Object.entries(PLAN_CATALOG)) {
      const row = rows[planId]
      expect(row, `plans row missing for ${planId}`).toBeDefined()
      expect(row!.name).toBe(entry.name)
      expect(row!.monthly_credits).toBe(entry.monthlyCredits)
      expect(row!.price_inr).toBe(entry.priceInr)
      expect(row!.price_usd).toBe(entry.priceUsd)
      // Parsed, not compared raw: the column is loose jsonb, so this also proves the stored
      // shape is a valid PlanLimits and not merely deep-equal to one.
      expect(PlanLimitsSchema.parse(row!.limits)).toEqual(entry.limits)
    }
  })
})
