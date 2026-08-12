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
import { newResolveObjectRef } from '@/lib/brand/resolve-object-ref'
import {
  mapResolveOutcome,
  type CreditsOutcome,
  type MeshResolveOutcome,
  type ResolveActionState,
} from '@/lib/brand/resolve-result'
import { IntakeSchema } from '@/lib/onboarding/intake'
import { isFirstResolve } from '@/lib/onboarding/read-brain'
import { toResolveInput } from '@/lib/onboarding/to-resolve-input'
import { reportServerError } from '@/lib/observability/report'
import { getActiveWorkspace } from '@/lib/workspaces'

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
  'Showing a sample Brand Brain — the model could not be reached, so nothing was charged. Retry to resolve yours.'

// NOTHING ELSE IS EXPORTED FROM HERE. Every export of a `'use server'` module
// is a callable endpoint, so `isFirstResolve` (which takes a workspace id) and
// the cost lookup live in `read-brain.ts` and `@sahoda/shared` respectively —
// neither has any reason to be reachable from a browser.

interface ResolveArgs {
  workspaceId: string
  userId: string
  input: ReturnType<typeof toResolveInput>
}

/** The free path: the model call, with no ledger involvement whatsoever. */
async function resolveFree({
  workspaceId,
  userId,
  input,
}: ResolveArgs): Promise<OnboardingResolveState> {
  const result = await getMesh().runTask(brandGuidelinesTask.def, input, {
    workspaceId,
    traceId: randomUUID(),
    userId,
    actionType: 'brand_research',
    creditsCharged: 0,
  })

  if (!result.ok) return { ok: false, kind: 'error', message: result.error.message }
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
}: ResolveArgs): Promise<OnboardingResolveState> {
  let meshOutcome: MeshResolveOutcome | null = null

  const credits = await getWithCredits()(
    { workspaceId, action: 'brand_research', objectRef: newResolveObjectRef(workspaceId) },
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

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, kind: 'error', message: 'Create a workspace first.' }
    workspaceId = workspace.id

    const intake = IntakeSchema.safeParse({
      model: formData.get('model'),
      regime: formData.get('regime'),
      locale: formData.get('locale'),
    })
    if (!intake.success) {
      return { ok: false, kind: 'error', message: 'Pick what you are before resolving.' }
    }

    const input = toResolveInput({
      intake: intake.data,
      doorText: String(formData.get('doorText') ?? ''),
      refusal: String(formData.get('refusal') ?? ''),
      name: String(formData.get('name') ?? '') || workspace.name,
    })

    const args: ResolveArgs = { workspaceId: workspace.id, userId, input }
    return (await isFirstResolve(workspace.id))
      ? await resolveFree(args)
      : await resolveCharged(args)
  } catch (error) {
    reportServerError(error, { action: 'resolveOnboarding', workspaceId })
    reportPaidActionFailure('onboarding-resolve', error)
    if (isDeploymentConfigCause(error)) {
      return { ok: false, kind: 'error', message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return { ok: false, kind: 'error', message: 'Could not resolve your brand — try again.' }
  }
}
