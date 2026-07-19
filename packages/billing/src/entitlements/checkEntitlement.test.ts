import { describe, expect, it } from 'vitest'
import { PLAN_CATALOG, type PlanId } from '@sahoda/shared'
import { createCheckEntitlement } from './checkEntitlement'
import type { PlanResolverPort } from './port'

const resolverFor = (planId: PlanId): PlanResolverPort => ({
  resolvePlanId: async () => planId,
})

const deps = { newTraceId: () => 'trace-fixed' }
const WS = 'ws-1'

describe('checkEntitlement — plan resolution', () => {
  it('returns the resolved plan and its catalog limits', async () => {
    const check = createCheckEntitlement(resolverFor('growth'), deps)

    const result = await check({ workspaceId: WS })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.planId).toBe('growth')
    expect(result.data.limits).toEqual(PLAN_CATALOG.growth.limits)
  })

  it('allows and reports no limit when no dimension is named', async () => {
    const check = createCheckEntitlement(resolverFor('free'), deps)

    const result = await check({ workspaceId: WS })

    if (!result.ok) throw new Error('expected ok')
    expect(result.data.allowed).toBe(true)
    expect(result.data.limit).toBeNull()
  })

  it('passes the workspaceId through to the resolver', async () => {
    const seen: string[] = []
    const check = createCheckEntitlement(
      { resolvePlanId: async (id) => (seen.push(id), 'starter') },
      deps,
    )

    await check({ workspaceId: 'ws-abc' })

    expect(seen).toEqual(['ws-abc'])
  })
})

describe('checkEntitlement — countable dimensions', () => {
  // growth: channels 8, sites 3, seats 3, twinSize 100
  it('allows when usage is below the limit', async () => {
    const check = createCheckEntitlement(resolverFor('growth'), deps)

    const result = await check({ workspaceId: WS, dimension: 'channels', currentUsage: 7 })

    if (!result.ok) throw new Error('expected ok')
    expect(result.data.allowed).toBe(true)
    expect(result.data.limit).toBe(8)
  })

  /**
   * The boundary is the whole point: `currentUsage` is what exists ALREADY, and the caller is
   * about to add one more. At usage == limit the next one would exceed, so it must deny.
   * Off-by-one here silently sells every plan one extra unit.
   */
  it('denies at exactly the limit (the next one would exceed)', async () => {
    const check = createCheckEntitlement(resolverFor('growth'), deps)

    const result = await check({ workspaceId: WS, dimension: 'channels', currentUsage: 8 })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('ENTITLEMENT_ERROR')
  })

  it('allows at limit - 1', async () => {
    const check = createCheckEntitlement(resolverFor('growth'), deps)

    const result = await check({ workspaceId: WS, dimension: 'sites', currentUsage: 2 })

    expect(result.ok).toBe(true)
  })

  it('denies above the limit', async () => {
    const check = createCheckEntitlement(resolverFor('growth'), deps)

    const result = await check({ workspaceId: WS, dimension: 'sites', currentUsage: 99 })

    expect(result.ok).toBe(false)
  })

  it('denies a zero-limit dimension outright (free has no sites)', async () => {
    const check = createCheckEntitlement(resolverFor('free'), deps)

    const result = await check({ workspaceId: WS, dimension: 'sites', currentUsage: 0 })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('ENTITLEMENT_ERROR')
  })

  it('carries the decision inputs as error details for the UI', async () => {
    const check = createCheckEntitlement(resolverFor('free'), deps)

    const result = await check({ workspaceId: WS, dimension: 'channels', currentUsage: 2 })

    if (result.ok) throw new Error('expected err')
    expect(result.error.details).toMatchObject({
      dimension: 'channels',
      limit: 2,
      currentUsage: 2,
      planId: 'free',
    })
  })
})

/**
 * loopLevel is a LEVEL (max autonomy 0..3), not a count. Every other dimension denies at
 * `usage >= limit`; loopLevel must allow `requested == limit`. Getting this backwards either
 * blocks the tier the customer paid for or silently grants one above it.
 */
describe('checkEntitlement — loopLevel is a level, not a count', () => {
  it('allows a request EQUAL to the plan max (growth caps at 3)', async () => {
    const check = createCheckEntitlement(resolverFor('growth'), deps)

    const result = await check({ workspaceId: WS, dimension: 'loopLevel', currentUsage: 3 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.limit).toBe(3)
  })

  it('denies a request ABOVE the plan max', async () => {
    const check = createCheckEntitlement(resolverFor('growth'), deps)

    const result = await check({ workspaceId: WS, dimension: 'loopLevel', currentUsage: 4 })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('ENTITLEMENT_ERROR')
  })

  it('denies level 2 on free, which caps at 1', async () => {
    const check = createCheckEntitlement(resolverFor('free'), deps)

    const result = await check({ workspaceId: WS, dimension: 'loopLevel', currentUsage: 2 })

    expect(result.ok).toBe(false)
  })

  it('allows level 1 on free', async () => {
    const check = createCheckEntitlement(resolverFor('free'), deps)

    const result = await check({ workspaceId: WS, dimension: 'loopLevel', currentUsage: 1 })

    expect(result.ok).toBe(true)
  })

  // The contrast that proves the two rules are genuinely different code paths.
  it('differs from a countable dimension at the same numbers', async () => {
    const check = createCheckEntitlement(resolverFor('starter'), deps) // loopLevel 2, seats 1

    const level = await check({ workspaceId: WS, dimension: 'loopLevel', currentUsage: 2 })
    const count = await check({ workspaceId: WS, dimension: 'seats', currentUsage: 1 })

    expect(level.ok).toBe(true) // requested == max -> allowed
    expect(count.ok).toBe(false) // usage == limit -> denied
  })
})

describe('checkEntitlement — availability check when no usage is supplied', () => {
  it('allows when the plan grants any of the dimension', async () => {
    const check = createCheckEntitlement(resolverFor('starter'), deps)

    const result = await check({ workspaceId: WS, dimension: 'sites' }) // starter: 1

    expect(result.ok).toBe(true)
  })

  it('denies when the plan grants none of it', async () => {
    const check = createCheckEntitlement(resolverFor('free'), deps)

    const result = await check({ workspaceId: WS, dimension: 'sites' }) // free: 0

    expect(result.ok).toBe(false)
  })

  it('denies twinSize on free, which has none', async () => {
    const check = createCheckEntitlement(resolverFor('free'), deps)

    const result = await check({ workspaceId: WS, dimension: 'twinSize' })

    expect(result.ok).toBe(false)
  })
})

describe('checkEntitlement — failure behaviour', () => {
  /**
   * Same contract as withCredits: callers branch on `.ok` and never expect a rejection.
   * A gate that throws would be swallowed by the call site's outer catch and rendered as a
   * generic error, hiding a real infrastructure failure.
   */
  it('returns a typed error instead of rejecting when the resolver throws', async () => {
    const check = createCheckEntitlement(
      {
        resolvePlanId: async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2')
        },
      },
      deps,
    )

    const result = await check({ workspaceId: WS, dimension: 'channels', currentUsage: 0 })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.message).toBe('Could not check your plan entitlements')
    expect(result.error.message).not.toContain('hunter2')
  })

  it('hands the raw cause to onError while keeping the Result clean', async () => {
    const seen: unknown[] = []
    const check = createCheckEntitlement(
      {
        resolvePlanId: async () => {
          throw new Error('boom-detail')
        },
      },
      { ...deps, onError: (cause) => seen.push(cause) },
    )

    await check({ workspaceId: WS })

    expect((seen[0] as Error).message).toBe('boom-detail')
  })

  it('fails closed on an unknown plan id rather than granting', async () => {
    const check = createCheckEntitlement(
      { resolvePlanId: async () => 'enterprise' as PlanId },
      deps,
    )

    const result = await check({ workspaceId: WS, dimension: 'channels', currentUsage: 0 })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
  })

  it('carries the traceId', async () => {
    const check = createCheckEntitlement(resolverFor('free'), { newTraceId: () => 'trace-xyz' })

    const result = await check({ workspaceId: WS, dimension: 'sites', currentUsage: 0 })

    if (result.ok) throw new Error('expected err')
    expect(result.error.traceId).toBe('trace-xyz')
  })
})
