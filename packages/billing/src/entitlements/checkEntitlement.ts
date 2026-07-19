import { randomUUID } from 'node:crypto'
import {
  appError,
  err,
  getEntitlements,
  ok,
  PLAN_CATALOG,
  type PlanId,
  type PlanLimits,
  type Result,
} from '@sahoda/shared'
import type { PlanResolverPort } from './port'

/** User-facing failure copy. Fixed so no DB internals leak (see withCredits). */
const GENERIC_FAILURE = 'Could not check your plan entitlements'

/** The plan limits a caller can gate on. */
export type EntitlementDimension = keyof PlanLimits

/**
 * Dimensions that express a MAX LEVEL rather than a countable allowance.
 *
 * `loopLevel` is the highest autonomy level (0..3) a plan may run, so a request EQUAL to the
 * limit is allowed (`requested <= limit`). Every countable dimension denies at
 * `usage >= limit`, because `currentUsage` is what already exists and one more would exceed.
 * Conflating the two either blocks the tier a customer paid for or grants one above it.
 */
const LEVEL_DIMENSIONS: ReadonlySet<EntitlementDimension> = new Set(['loopLevel'])

export interface EntitlementCheckInput {
  workspaceId: string
  /** The limit this action is about to consume. Omit for actions no limit constrains. */
  dimension?: EntitlementDimension
  /**
   * For countable dimensions: how many already exist (the caller is adding one more).
   * For level dimensions (`loopLevel`): the level being requested.
   * Omit to ask only whether the plan grants any of this dimension at all.
   */
  currentUsage?: number
}

export interface EntitlementCheck {
  planId: PlanId
  limits: PlanLimits
  /** The limit for the checked dimension, or null when no dimension was named. */
  limit: number | null
  allowed: boolean
}

export interface EntitlementDeniedDetails {
  dimension: EntitlementDimension
  limit: number
  currentUsage: number | null
  planId: PlanId
}

export interface CheckEntitlementDeps {
  newTraceId?: () => string
  /** Server-side observability hook; the raw cause never reaches the Result. */
  onError?: (cause: unknown, traceId: string) => void
}

export type CheckEntitlementFn = (input: EntitlementCheckInput) => Promise<Result<EntitlementCheck>>

/**
 * The entitlements gate (owner ruling #5): a SEPARATE helper called BEFORE `withCredits` at
 * every AI entry point — never inside the wrapper.
 *
 * Takes `workspaceId` explicitly and never reads request-scoped context, because it must run
 * from apps/jobs (Trigger.dev — no Clerk `auth()`, no cookies) as well as from a Next server
 * action. Returns a `Result` and never rejects, matching `withCredits` so both halves of a
 * call site share one error shape.
 *
 * Plan id is resolved from the database; the limit VALUES come from `PLAN_CATALOG` via
 * `getEntitlements`. The `plans.limits` jsonb column is a seeded fold of that same catalog
 * ("D7 fold … Alpha reads, never edits") and is typed as loose `JsonbSchema`, so reading the
 * catalog is both typed and one query cheaper. A real-DB drift test asserts the two agree.
 */
export function createCheckEntitlement(
  port: PlanResolverPort,
  deps: CheckEntitlementDeps = {},
): CheckEntitlementFn {
  const newTraceId = deps.newTraceId ?? (() => randomUUID())

  const notifyError = (cause: unknown, traceId: string): void => {
    try {
      deps.onError?.(cause, traceId)
    } catch {
      // a broken logger must not turn a typed error into a rejection
    }
  }

  return async function checkEntitlement(
    input: EntitlementCheckInput,
  ): Promise<Result<EntitlementCheck>> {
    const traceId = newTraceId()

    try {
      const planId = await port.resolvePlanId(input.workspaceId)

      // Fail CLOSED. An unrecognised plan must never fall through to a permissive default.
      if (!PLAN_CATALOG[planId]) {
        notifyError(new Error(`unknown planId ${JSON.stringify(planId)}`), traceId)
        return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
      }

      const limits = getEntitlements(planId)

      if (!input.dimension) {
        return ok({ planId, limits, limit: null, allowed: true })
      }

      const limit = limits[input.dimension]
      const usage = input.currentUsage ?? null
      const allowed = isAllowed(input.dimension, limit, usage)

      if (!allowed) {
        const details: EntitlementDeniedDetails = {
          dimension: input.dimension,
          limit,
          currentUsage: usage,
          planId,
        }
        return err(
          appError(
            'ENTITLEMENT_ERROR',
            `Your ${PLAN_CATALOG[planId].name} plan does not allow this`,
            traceId,
            details,
          ),
        )
      }

      return ok({ planId, limits, limit, allowed: true })
    } catch (unexpected) {
      notifyError(unexpected, traceId)
      return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
    }
  }
}

/**
 * The decision. `usage === null` means "does the plan grant any of this at all", which is the
 * same question for both kinds of dimension.
 */
function isAllowed(dimension: EntitlementDimension, limit: number, usage: number | null): boolean {
  if (usage === null) return limit > 0
  return LEVEL_DIMENSIONS.has(dimension) ? usage <= limit : usage < limit
}
