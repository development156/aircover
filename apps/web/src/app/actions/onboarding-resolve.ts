'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { brandGuidelinesTask, createMesh, type Mesh } from '@sahoda/mesh'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import {
  creditCost,
  type BrandMemoryPayload,
  type CreditInsufficientDetails,
  type WithCreditsFn,
} from '@sahoda/shared'

import {
  DEPLOYMENT_CONFIG_MESSAGE,
  isDeploymentConfigCause,
  reportPaidActionFailure,
} from '@/lib/actions/paid-failure'
import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { resolveObjectRef } from '@/lib/brand/resolve-object-ref'
import {
  mapResolveOutcome,
  type CreditsOutcome,
  type MeshResolveOutcome,
  type ResolveActionState,
} from '@/lib/brand/resolve-result'
import { IntakeSchema } from '@/lib/onboarding/intake'
import { FREE_RESOLVES_PER_DAY, freeResolveAllowed } from '@/lib/onboarding/limits'
import { readActiveBrandMemory } from '@/lib/onboarding/read-brain'
import { toResolveInput } from '@/lib/onboarding/to-resolve-input'
import { reportServerError } from '@/lib/observability/report'
import { workspaceForWrite } from '@/lib/workspaces'

// 'use server' modules may export only async functions — these stay module-private.
let meshSingleton: Mesh | undefined
function getMesh(): Mesh {
  return (meshSingleton ??= createMesh())
}

let withCreditsSingleton: WithCreditsFn | undefined
function getWithCredits(): WithCreditsFn {
  if (withCreditsSingleton) return withCreditsSingleton
  const { databaseUrl } = loadBillingEnv()
  withCreditsSingleton = createWithCredits(createPgLedgerPort({ connectionString: databaseUrl }))
  return withCreditsSingleton
}

/**
 * `free` is a fourth success shape, not a `resolved` with a zero in it.
 *
 * A `resolved` carries `balanceAfter`, and on the free path there is no debit,
 * so there is no balance to report — inventing one, or reporting the unchanged
 * balance as though it were a result of this action, would be a fake number on
 * a money surface. The UI branches on the kind and simply shows no ledger line.
 */
export type OnboardingResolveState =
  ResolveActionState | { ok: true; kind: 'free'; brain: BrandMemoryPayload }

const FALLBACK_MESSAGE =
  'Showing a sample Brand Brain. The model could not be reached, so nothing was charged. Retry to resolve yours.'

/**
 * The read that decides free-or-charged did not get an answer. Neither arm may
 * be assumed: "free" would give away a 50-credit build on a database hiccup,
 * and "charged" would bill for a first build the product promised for nothing.
 */
const BRAIN_UNREADABLE_MESSAGE =
  'Sahoda could not read your saved Brand Brain just now, so it cannot tell whether this build is free. Nothing ran and nothing was charged. Try again.'

const FREE_LIMIT_MESSAGE = `Sahoda has built a free Brand Brain for this workspace ${FREE_RESOLVES_PER_DAY} times today, which is the daily limit. Nothing ran and nothing was charged. Try again tomorrow.`

// NOTHING ELSE IS EXPORTED FROM HERE. Every export of a `'use server'` module
// is a callable endpoint, so `isFirstResolve` (which takes a workspace id) and
// the cost lookup live in `read-brain.ts` and `@sahoda/shared` respectively —
// neither has any reason to be reachable from a browser.

interface ResolveArgs {
  workspaceId: string
  userId: string
  input: ReturnType<typeof toResolveInput>
}

interface ChargedArgs extends ResolveArgs {
  /**
   * The version of the brain this purchase REPLACES, which is what the ledger
   * key is bound to. See `resolve-object-ref.ts`: a retry after an abandoned
   * paid build carries the same version, so the ledger replays the charge it
   * already took instead of taking a second one.
   */
  activeVersion: number
}

/**
 * The free path: the model call, with no ledger involvement whatsoever.
 *
 * BOUNDED, not counted. Nothing durable records a free build (the brain is
 * written only when the customer keeps one), so a person who never keeps one
 * could loop a real model call at zero credits for ever. A daily window per
 * person and per workspace ends that without a schema change.
 *
 * A mesh error is REPORTED here and MAPPED for the customer. It used to return
 * `result.error.message` verbatim, so the first build a customer ever ran was
 * the only one that could read "model output hit the 4096-token ceiling for
 * brand_guidelines and was cut off". The charged path never did; now neither
 * does.
 */
async function resolveFree({
  workspaceId,
  userId,
  input,
}: ResolveArgs): Promise<OnboardingResolveState> {
  if (!(await freeResolveAllowed(userId, workspaceId))) {
    return { ok: false, kind: 'error', message: FREE_LIMIT_MESSAGE }
  }

  const result = await getMesh().runTask(brandGuidelinesTask.def, input, {
    workspaceId,
    traceId: randomUUID(),
    userId,
    actionType: 'brand_research',
    creditsCharged: 0,
  })

  if (!result.ok) {
    reportServerError(new Error(result.error.message), {
      action: 'resolveOnboarding.free',
      workspaceId,
    })
    return mapResolveOutcome(
      { kind: 'error', message: result.error.message },
      { ok: false, insufficient: false, message: result.error.message },
    )
  }
  if ((result as { fallback?: boolean }).fallback === true) {
    return { ok: true, kind: 'fallback', brain: result.data, message: FALLBACK_MESSAGE }
  }
  return { ok: true, kind: 'free', brain: result.data }
}

/**
 * The charged path — identical in structure to `brand-resolve.ts#resolveBrand`,
 * which is the reference implementation of this repo's charge policy: a demo
 * fallback or an error THROWS inside the wrapper so the hold is released and
 * the user is not charged, and only a genuine resolve reaches the DEBIT.
 */
async function resolveCharged({
  workspaceId,
  userId,
  input,
  activeVersion,
}: ChargedArgs): Promise<OnboardingResolveState> {
  let meshOutcome: MeshResolveOutcome | null = null

  const credits = await getWithCredits()(
    {
      workspaceId,
      action: 'brand_research',
      objectRef: resolveObjectRef(workspaceId, activeVersion),
    },
    async (ctx) => {
      const result = await getMesh().runTask(brandGuidelinesTask.def, input, {
        workspaceId,
        traceId: randomUUID(),
        userId,
        actionType: ctx.actionType,
        creditsCharged: ctx.creditsCharged,
      })
      if (!result.ok) {
        meshOutcome = { kind: 'error', message: result.error.message }
        throw new Error('MESH_ERROR') // -> RELEASE, no charge
      }
      if ((result as { fallback?: boolean }).fallback === true) {
        meshOutcome = { kind: 'fallback', brain: result.data }
        throw new Error('MESH_FALLBACK') // -> RELEASE, no charge (a sample, not a resolve)
      }
      meshOutcome = { kind: 'real', brain: result.data }
      return result.data // -> DEBIT (the only charged path)
    },
  )

  // The balance moved, or may have. The chip lives in the layout, so a page
  // revalidate misses it. NOT called on the free path — nothing moved there.
  if (credits.ok || meshOutcome !== null) revalidateBalance()

  if (!credits.ok) {
    reportPaidActionFailure('onboarding-resolve', credits.error)
    if (meshOutcome === null && isDeploymentConfigCause(credits.error)) {
      return { ok: false, kind: 'error', message: DEPLOYMENT_CONFIG_MESSAGE }
    }
  }

  const creditsOutcome: CreditsOutcome = credits.ok
    ? { ok: true, balanceAfter: credits.data.balanceAfter }
    : credits.error.code === 'CREDIT_INSUFFICIENT'
      ? {
          ok: false,
          insufficient: true,
          required:
            (credits.error.details as CreditInsufficientDetails)?.required ??
            creditCost('brand_research'),
          available: (credits.error.details as CreditInsufficientDetails)?.available ?? 0,
        }
      : { ok: false, insufficient: false, message: credits.error.message }

  return mapResolveOutcome(meshOutcome, creditsOutcome)
}

/**
 * Resolve the Brand Brain from the three picks, the door text and the refusal.
 *
 * Which path runs is decided SERVER-SIDE from `brand_memory`. The client sends
 * no "this one is free" flag, because a client that could say that could say it
 * every time.
 */
export async function resolveOnboarding(
  _prev: OnboardingResolveState | null,
  formData: FormData,
): Promise<OnboardingResolveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, kind: 'error', message: 'Sign in to resolve your brand.' }

    // Two refusals, two sentences. "Create a workspace first" on a read that
    // failed is a remedy for a workspace the customer already has.
    const write = await workspaceForWrite()
    if (!write.ok) return { ok: false, kind: 'error', message: write.message }
    const workspace = write.workspace
    workspaceId = workspace.id

    const intake = IntakeSchema.safeParse({
      model: formData.get('model'),
      regime: formData.get('regime'),
      locale: formData.get('locale'),
    })
    if (!intake.success) {
      return { ok: false, kind: 'error', message: 'Pick what you are before resolving.' }
    }

    const field = (key: string): string => String(formData.get(key) ?? '')

    const input = toResolveInput({
      intake: intake.data,
      doorText: field('doorText'),
      refusal: field('refusal'),
      name: field('name') || workspace.name,
      // Collected across screens 02 and 03 and, until now, dropped here: the
      // form carried six values and the rest of what a person typed reached
      // nothing. Absent keys stay absent — `toResolveInput` treats each as
      // optional and contributes no clause for a blank.
      positioning: field('positioning'),
      audience: field('audience'),
      audienceAge: field('audienceAge'),
      audienceLoc: field('audienceLoc'),
      audienceRole: field('audienceRole'),
      audienceInterests: field('audienceInterests'),
    })

    /**
     * ONE read, two decisions. It used to call `isFirstResolve`, which is this
     * same query with the row thrown away. The charged path needs the version
     * as well as the existence, and reading it twice would let the two answers
     * disagree under a concurrent save.
     */
    const active = await readActiveBrandMemory(workspace.id)
    if (active.status === 'unreadable') {
      return { ok: false, kind: 'error', message: BRAIN_UNREADABLE_MESSAGE }
    }
    const args: ResolveArgs = { workspaceId: workspace.id, userId, input }
    return active.status === 'none'
      ? await resolveFree(args)
      : await resolveCharged({ ...args, activeVersion: active.brain.version })
  } catch (error) {
    reportServerError(error, { action: 'resolveOnboarding', workspaceId })
    reportPaidActionFailure('onboarding-resolve', error)
    if (isDeploymentConfigCause(error)) {
      return { ok: false, kind: 'error', message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return { ok: false, kind: 'error', message: 'Could not resolve your brand. Try again.' }
  }
}
