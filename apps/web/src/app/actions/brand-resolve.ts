'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { brandGuidelinesTask, createMesh, type Mesh } from '@sahoda/mesh'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import {
  BrandMemoryPayloadSchema,
  ResolveBrandMemoryResultSchema,
  creditCost,
  type CreditInsufficientDetails,
  type WithCreditsFn,
} from '@sahoda/shared'

import {
  DEPLOYMENT_CONFIG_MESSAGE,
  isDeploymentConfigCause,
  reportPaidActionFailure,
} from '@/lib/actions/paid-failure'
import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { reportServerError } from '@/lib/observability/report'
import { pruneBlankListEntries } from '@/lib/brand/prune-blank-entries'
import { newResolveObjectRef } from '@/lib/brand/resolve-object-ref'
import { mapSaveBrandError } from '@/lib/brand/save-brand-error'
import { createServerSupabase } from '@/lib/supabase/server'
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

export type SaveBrandState =
  { ok: true; version: number; replayed: boolean } | { ok: false; message: string }

/**
 * Persist the (possibly hand-edited) Brand Brain via `public.resolve_brand_memory`
 * — the one client-reachable write into `brand_memory` (the table is read-only
 * under RLS). Called with THREE arguments on purpose: omitting the optimistic
 * `p_expected_version` skips the compare-and-set, so a rage-click on Finish
 * replays the already-active payload as a success instead of raising
 * VERSION_CONFLICT. Identity and membership are derived from the JWT inside the
 * function; we still zod-parse both directions at this boundary.
 */
export async function saveBrandMemory(brain: unknown): Promise<SaveBrandState> {
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save your Brand Brain.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }
    workspaceId = workspace.id

    const parsed = BrandMemoryPayloadSchema.safeParse(brain)
    if (!parsed.success) {
      return { ok: false, message: 'That Brand Brain is incomplete — check the cards and retry.' }
    }

    // Prune AFTER validation: the schema pins the three fixed arrays at exactly 3,
    // and pruning only shortens the two open lists (which have no minimum). Blank
    // rows are cheap to create in the editor but permanent once saved — mesh
    // prepends the active brain to every model call.
    const payload = pruneBlankListEntries(parsed.data)

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('resolve_brand_memory', {
      p_workspace_id: workspace.id,
      p_payload: payload,
      p_source: 'resolved',
    })
    if (error || !data) return { ok: false, message: mapSaveBrandError(error) }

    const result = ResolveBrandMemoryResultSchema.safeParse(data)
    if (!result.success) {
      return { ok: false, message: 'Saved, but the response was unreadable — reload to confirm.' }
    }
    return { ok: true, version: result.data.version, replayed: result.data.replayed }
  } catch (error) {
    reportServerError(error, { action: 'saveBrandMemory', workspaceId })
    return { ok: false, message: 'Could not save your Brand Brain — try again.' }
  }
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
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId)
      return { ok: false, kind: 'error', message: 'Sign in to resolve your Brand Brain.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, kind: 'error', message: 'Create a workspace first.' }
    workspaceId = workspace.id

    const name = field(formData, 'name')
    if (!name) return { ok: false, kind: 'error', message: 'Enter your business name.' }

    // Every field the Spark screen collects now reaches the model. `description`
    // has no input mounted yet, so it reads '' in production — the mapper is
    // ready for the field the moment a screen asks for it.
    const spark: SparkInput = {
      name,
      category: field(formData, 'category'),
      website: field(formData, 'website'),
      instagram: field(formData, 'instagram'),
      description: field(formData, 'description'),
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

    // The balance moved (or may have, when the model delivered but the wrapper
    // still failed). The chip lives in the layout, so a page revalidate misses it.
    if (credits.ok || meshOutcome !== null) revalidateBalance()

    if (!credits.ok) {
      reportPaidActionFailure('brand-resolve', credits.error)
      // A mesh config throw inside the callback released the hold (meshOutcome
      // is still null there — getMesh() failed before runTask could stash one),
      // so the not-charged claim is verifiable and a retry cannot fix it.
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
  } catch (error) {
    reportServerError(error, { action: 'resolveBrand', workspaceId })
    reportPaidActionFailure('brand-resolve', error)
    // The billing env loader throws before any HOLD exists — config failures
    // caught here are verifiably uncharged, and a retry cannot fix them.
    if (isDeploymentConfigCause(error)) {
      return { ok: false, kind: 'error', message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return { ok: false, kind: 'error', message: 'Could not resolve your Brand Brain — try again.' }
  }
}
