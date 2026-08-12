import 'server-only'

import {
  createCheckEntitlement,
  createPgPlanResolver,
  loadBillingEnv,
  type CheckEntitlementFn,
} from '@sahoda/billing'
import { PlanIdSchema } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { planLimitSentence, type CountableDimension } from './limit-copy'

/**
 * The entitlements gate, mounted for apps/web (owner ruling #5).
 *
 * Lazily built for the same reason as `getWithCredits` in the paid actions: the pg
 * pool must not be constructed at module load, which would run at build time where
 * no database URL exists.
 */
let singleton: CheckEntitlementFn | undefined
export function getCheckEntitlement(): CheckEntitlementFn {
  if (singleton) return singleton
  const { databaseUrl } = loadBillingEnv()
  singleton = createCheckEntitlement(createPgPlanResolver({ connectionString: databaseUrl }), {
    // The gate returns fixed copy and keeps raw causes off the Result — this is the
    // only place an unknown plan id or a dead pool becomes visible to a human.
    onError: (cause) => reportServerError(cause, { action: 'checkEntitlement' }),
  })
  return singleton
}

/**
 * The verdict a caller acts on.
 *
 * `unknown` is deliberately NOT folded into `blocked`. Both refuse — every caller
 * here fails closed — but they must not SAY the same thing: `blocked` names the
 * plan and the number, and claiming "your Free plan doesn't include a site" when
 * the truth is "we could not reach the database" is a fabricated reason that sends
 * the customer to a pricing page for a problem that is ours.
 */
export type LimitVerdict =
  { kind: 'allowed'; limit: number } | { kind: 'blocked'; sentence: string } | { kind: 'unknown' }

interface DeniedDetails {
  limit: number
  currentUsage: number | null
  planId: string
}

/** The gate's `ENTITLEMENT_ERROR` payload, narrowed from `unknown` rather than cast. */
function deniedDetails(details: unknown): DeniedDetails | null {
  if (typeof details !== 'object' || details === null) return null
  const raw = details as Record<string, unknown>
  if (typeof raw.limit !== 'number') return null
  if (!PlanIdSchema.safeParse(raw.planId).success) return null
  return {
    limit: raw.limit,
    currentUsage: typeof raw.currentUsage === 'number' ? raw.currentUsage : null,
    planId: raw.planId as string,
  }
}

/**
 * Ask whether the workspace may add ONE MORE of a countable dimension.
 *
 * ⚠ `currentUsage` is REQUIRED and must be a real count. The gate's `isAllowed`
 * falls back to `limit > 0` when usage is absent, which answers a different and
 * much weaker question — "does the plan grant any of these at all". That weaker
 * answer happens to refuse Free/`sites: 0` correctly, which is exactly what makes
 * omitting the count so easy to get away with: the headline case still passes while
 * a Starter workspace that already holds its one site is admitted forever. There is
 * a named test for that sibling (`limit-gates.test.ts`).
 */
export async function checkCountableLimit(
  workspaceId: string,
  dimension: CountableDimension,
  currentUsage: number,
): Promise<LimitVerdict> {
  // NEVER THROWS. `checkEntitlement` itself returns a Result and does not reject, but
  // `getCheckEntitlement()` calls `loadBillingEnv()`, which throws by design when
  // SUPABASE_DB_URL is unset — and this function is now on the RENDER path of /sites
  // and /connections, not only inside a server action with a catch around it. Letting
  // that escape would turn a missing env var into a 500 on two pages that render
  // perfectly well without it (the cloud sandbox has no .env at all). Degrading to
  // `unknown` keeps those pages up and still admits nothing: every caller fails closed.
  let result: Awaited<ReturnType<CheckEntitlementFn>>
  try {
    result = await getCheckEntitlement()({ workspaceId, dimension, currentUsage })
  } catch (cause) {
    reportServerError(cause, { action: 'checkCountableLimit' })
    return { kind: 'unknown' }
  }

  if (result.ok) {
    // `limit` is only null when no dimension was named, and one always is here.
    return result.data.limit === null
      ? { kind: 'unknown' }
      : { kind: 'allowed', limit: result.data.limit }
  }

  if (result.error.code !== 'ENTITLEMENT_ERROR') return { kind: 'unknown' }

  const details = deniedDetails(result.error.details)
  if (!details) return { kind: 'unknown' }

  return {
    kind: 'blocked',
    sentence: planLimitSentence({
      dimension,
      planId: PlanIdSchema.parse(details.planId),
      limit: details.limit,
      // The gate echoes back what it was given; fall back to what we passed rather
      // than to 0, which would render "you're using 0" next to a refusal.
      currentUsage: details.currentUsage ?? currentUsage,
    }),
  }
}
