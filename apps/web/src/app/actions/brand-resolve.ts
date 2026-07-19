'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { brandGuidelinesTask, createMesh, type Mesh } from '@sahoda/mesh'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { creditCost, type CreditInsufficientDetails, type WithCreditsFn } from '@sahoda/shared'

import { newResolveObjectRef } from '@/lib/brand/resolve-object-ref'
import {
  mapResolveOutcome,
  type CreditsOutcome,
  type MeshResolveOutcome,
  type ResolveActionState,
} from '@/lib/brand/resolve-result'
import { sparkToResolveInput, type SparkInput } from '@/lib/brand/spark-to-resolve-input'
import { getActiveWorkspace } from '@/lib/workspaces'

// 'use server' modules may export only async functions — these singletons stay
// module-private (never `export`ed). Built lazily so a missing key surfaces as a
// typed error inside the action, not an import-time crash.
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

function field(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Resolve the active workspace's Brand Brain from a minimal spark. `withCredits`
 * reserves the 50cr, runs `brand_guidelines`, and DEBITs — but only on a *real*
 * resolve: a demo fallback or an error throws inside the wrapper so the hold is
 * RELEASED (the user is not charged), and the flagged fallback is carried out so
 * the UI can show it honestly (never as a genuine resolve).
 */
export async function resolveBrand(
  _prev: ResolveActionState | null,
  formData: FormData,
): Promise<ResolveActionState> {
  try {
    const { userId } = await auth()
    if (!userId)
      return { ok: false, kind: 'error', message: 'Sign in to resolve your Brand Brain.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, kind: 'error', message: 'Create a workspace first.' }

    const name = field(formData, 'name')
    if (!name) return { ok: false, kind: 'error', message: 'Enter your business name.' }

    const spark: SparkInput = {
      name,
      category: field(formData, 'category'),
      website: field(formData, 'website'),
      instagram: field(formData, 'instagram'),
    }
    const input = sparkToResolveInput(spark)

    // SERVER-DERIVED ledger key + trace id — never from the request body. A
    // client-supplied objectRef could replay a spent key: withCredits would replay
    // the HOLD+DEBIT (no new charge) while still running the paid model call.
    const objectRef = newResolveObjectRef(workspace.id)
    const traceId = randomUUID()

    // TODO(owner ruling #5): entitlements are a SEPARATE gate called BEFORE
    // withCredits at every AI entry point. Mount it here once @sahoda/billing
    // ships the gate helper — today only the credit balance limits this action.
    let meshOutcome: MeshResolveOutcome | null = null
    const credits = await getWithCredits()(
      { workspaceId: workspace.id, action: 'brand_research', objectRef },
      async (ctx) => {
        const result = await getMesh().runTask(brandGuidelinesTask.def, input, {
          workspaceId: workspace.id,
          traceId,
          userId,
          actionType: ctx.actionType,
          creditsCharged: ctx.creditsCharged,
        })
        if (!result.ok) {
          meshOutcome = { kind: 'error', message: result.error.message }
          throw new Error('MESH_ERROR') // → RELEASE, no charge
        }
        // runTask's declared return is the frozen Result<O> (no `fallback`); the mesh
        // engine sets `fallback:true` at runtime on a demo-fallback (double JSON failure).
        if ((result as { fallback?: boolean }).fallback === true) {
          meshOutcome = { kind: 'fallback', brain: result.data }
          throw new Error('MESH_FALLBACK') // → RELEASE, no charge (a sample, not a resolve)
        }
        meshOutcome = { kind: 'real', brain: result.data }
        return result.data // → DEBIT (the only charged path)
      },
    )

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
  } catch {
    return { ok: false, kind: 'error', message: 'Could not resolve your Brand Brain — try again.' }
  }
}
