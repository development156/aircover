'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, type Mesh } from '@sahoda/mesh'
import {
  GenerationModeSchema,
  MESH_TASK_ACTION,
  StudioGenerationSchema,
  type BrandSignal,
  type WithCreditsFn,
} from '@sahoda/shared'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { kindForProvenMime } from '@/lib/assets/kind'
import { reportServerError } from '@/lib/observability/report'
import {
  FAILURE_REASON,
  chargeFailureState,
  type ChargeFailureState,
} from '@/lib/posts/charge-failure'
import { MEDIA_BUCKET, MEDIA_UPLOAD_CAP_BYTES } from '@/lib/posts/media-constants'
import { assetObjectPath } from '@/lib/posts/media-path'
import { sniffImage } from '@/lib/posts/sniff-image'
import { brandSignalsFor } from '@/lib/studio/brand-signals'
import { formatById } from '@/lib/studio/formats'
import { conditionPrompt } from '@/lib/studio/prompt'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * THE STUDIO'S ONE WRITE: ASK A MODEL FOR A PICTURE.
 *
 * ── THE ROW IS WRITTEN BEFORE THE MODEL IS CALLED, AND THAT IS THE DESIGN ───
 * A generation takes between eight seconds and three minutes. MEASURED in this
 * repository: a server action CANNOT outlive the navigation that triggered it
 * (`components/posts/draft-recovery.ts` records `net::ERR_ABORTED` on a Back
 * press), and a Back inside this app does not unmount the segment, so no
 * cleanup, `pagehide` or `beforeunload` fires either.
 *
 * So the request is written to `studio_generations` FIRST. If the browser goes
 * away mid-flight the row is still there, still says what was asked and what it
 * cost, and the person finds it when they come back. Holding the request only in
 * React state would mean a Back press destroyed something they had paid for.
 *
 * ── AND NOBODY PAYS FOR A FAILURE ───────────────────────────────────────────
 * `withCredits` reserves the credits, the work runs inside the callback, and a
 * THROW in there releases the hold so nothing is charged. Every refusal below is
 * a throw for exactly that reason. The action string comes from
 * `MESH_TASK_ACTION`, never a literal: the mesh task is `image_generate` and the
 * pricing key is `image_standard`, and hardcoding either is how the two drift.
 *
 * ── THE BYTES GO THROUGH THE SAME GATE AS AN UPLOAD ─────────────────────────
 * `sniffImage` reads the real format and dimensions from the BYTES rather than
 * from the model's word for them. A generator that says PNG and returns WebP, or
 * that returns 512x512 when asked for 1080x1350, produces a file a platform
 * refuses at publish time. Catching it here costs a released hold; catching it
 * there costs somebody a post that silently never went out.
 */

// 'use server' modules may export only async functions, so these singletons stay
// module-private. Built lazily: `createMesh()` throws SYNCHRONOUSLY on a missing
// env var, and at module scope that 500s every route that imports this file.
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

const GenerateInputSchema = z.object({
  mode: GenerationModeSchema,
  /** What the person typed. The same bounds the mesh's own input carries. */
  wanted: z.string().trim().min(3).max(1000),
  /** A preset id. Resolved through `formatById`, so a size the picker hid cannot be spent on. */
  formatId: z.string().min(1).max(40),
})

export type QueueGenerationState =
  | { ok: true; generationId: string; balanceAfter: number }
  | { ok: false; insufficient: false; message: string }
  | ChargeFailureState

const REFUSALS = {
  signedOut: 'Sign in to make an image.',
  malformed: 'Describe the picture you want, in a few words at least.',
  unknownFormat: 'That size is not one Sahoda can make, so nothing was charged.',
  failed: 'Sahoda could not make this image. Nothing was charged.',
  unusable:
    'The model returned something Sahoda could not read as a picture. Nothing was charged, and you can try again.',
  stored: 'The image was made but could not be saved to your library. Nothing was charged.',
} as const

/**
 * Ask for one image.
 *
 * Returns as soon as the row exists and the model has answered. A series of
 * slides is Phase 2 and is deliberately not faked here: `requested_count` stays
 * at 1, so no row ever claims to have asked for more than was asked for.
 */
export async function queueGeneration(input: unknown): Promise<QueueGenerationState> {
  const action = MESH_TASK_ACTION.image_generate
  let workspaceId: string | undefined

  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, insufficient: false, message: REFUSALS.signedOut }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, insufficient: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const parsed = GenerateInputSchema.safeParse(input)
    if (!parsed.success) return { ok: false, insufficient: false, message: REFUSALS.malformed }

    // Through the SAME function the picker uses, so a hand-made request cannot
    // reach a size the screen refused to offer.
    const format = formatById(parsed.data.formatId)
    if (format === null) {
      return { ok: false, insufficient: false, message: REFUSALS.unknownFormat }
    }

    // Read before anything is charged: a brain that cannot be read produces an
    // unconditioned image, which is a worse picture and not a failure, and the
    // screen says which happened.
    const signals: BrandSignal[] = await brandSignalsFor(workspace.id)
    const conditioned = conditionPrompt({
      mode: parsed.data.mode,
      wanted: parsed.data.wanted,
      signals,
    })

    const supabase = createServerSupabase()

    // ── THE ROW, BEFORE THE MODEL ────────────────────────────────────────────
    const queued = await supabase
      .from('studio_generations')
      .insert({
        workspace_id: workspace.id,
        status: 'queued',
        mode: parsed.data.mode,
        prompt_given: parsed.data.wanted,
        prompt_sent: conditioned.prompt,
        format_id: format.id,
        width: format.width,
        height: format.height,
        requested_count: 1,
        // Explore legitimately used nothing, and `[]` says that. A null here
        // would mean conditioning never ran, which is a different claim.
        brand_signals: conditioned.used,
        created_by: userId,
      })
      .select('id')
      .single()

    if (queued.error || !queued.data) {
      return { ok: false, insufficient: false, message: REFUSALS.failed }
    }
    const generationId = queued.data.id as string

    const traceId = randomUUID()
    // Fresh per invocation and server-derived. A stable ref would let a second
    // press replay a spent hold: no charge, but the paid provider call still runs.
    const objectRef = `studio:${workspace.id}:${generationId}`

    // `delivered` is what makes a charge claim honest: only the caller can know
    // whether the callback reached its end, and the error alone cannot say.
    let failure: string | null = null
    let delivered = false
    let charged = 0

    const credits = await getWithCredits()(
      { workspaceId: workspace.id, action, objectRef },
      async (ctx: { actionType: string; creditsCharged: number }) => {
        await supabase
          .from('studio_generations')
          .update({ status: 'running', started_at: new Date().toISOString() })
          .eq('id', generationId)
          .eq('workspace_id', workspace.id)

        const result = await getMesh().runImage(
          {
            prompt: conditioned.prompt,
            size: 'square',
            // The exact canvas, not one of three ratios. Without this a story
            // comes back landscape with nothing saying so.
            dims: { width: format.width, height: format.height },
          },
          {
            workspaceId: workspace.id,
            traceId,
            userId,
            actionType: ctx.actionType,
            creditsCharged: ctx.creditsCharged,
          },
        )
        // Our own copy, never `result.error.message`: that can carry provider text.
        if (!result.ok) {
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('MESH_ERROR')
        }

        const bytes = Uint8Array.from(Buffer.from(result.data.base64, 'base64'))
        if (bytes.byteLength === 0 || bytes.byteLength > MEDIA_UPLOAD_CAP_BYTES) {
          failure = REFUSALS.unusable
          throw new Error('IMAGE_UNUSABLE')
        }

        // Facts, not the model's claim. `result.data.mime` is deliberately unused.
        const sniffed = sniffImage(bytes)
        if (!sniffed.ok) {
          failure = REFUSALS.unusable
          throw new Error('IMAGE_UNREADABLE')
        }
        const kind = kindForProvenMime(sniffed.image.mime)
        if (kind === null) {
          failure = REFUSALS.unusable
          throw new Error('IMAGE_UNSUPPORTED')
        }

        const newAssetId = randomUUID()
        const objectPath = assetObjectPath({
          workspaceId: workspace.id,
          assetId: newAssetId,
          mime: sniffed.image.mime,
        })
        const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, bytes, {
          contentType: sniffed.image.mime,
          upsert: false,
        })
        if (upload.error) {
          failure = REFUSALS.stored
          throw new Error('STORAGE_FAILED')
        }

        const row = await supabase.from('assets').insert({
          id: newAssetId,
          workspace_id: workspace.id,
          storage_path: objectPath,
          kind,
          mime: sniffed.image.mime,
          bytes: bytes.byteLength,
          width: sniffed.image.width,
          height: sniffed.image.height,
          created_by: userId,
        })
        if (row.error) {
          // The object is already in storage and nothing points at it. Remove it
          // rather than leaving bytes nobody can reach or delete.
          await supabase.storage.from(MEDIA_BUCKET).remove([objectPath])
          failure = REFUSALS.stored
          throw new Error('ASSET_ROW_FAILED')
        }

        charged = ctx.creditsCharged
        await supabase.from('studio_generation_images').insert({
          workspace_id: workspace.id,
          generation_id: generationId,
          idx: 0,
          asset_id: newAssetId,
          width: sniffed.image.width,
          height: sniffed.image.height,
        })
        delivered = true
      },
    )

    if (!credits.ok) {
      // The hold was released, so nothing was charged. The row records the
      // attempt and says why, because somebody who watched a spinner and got
      // nothing is owed an explanation they can find again tomorrow.
      await supabase
        .from('studio_generations')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_code: credits.error.code,
        })
        .eq('id', generationId)
        .eq('workspace_id', workspace.id)

      // Through the SAME mapper every other paid action uses. It decides whether
      // a charge claim is honest from `delivered`, which only the caller knows,
      // and it is deliberately unable to read the provider's own message.
      return chargeFailureState({ error: credits.error, action, delivered, reason: failure })
    }

    await supabase
      .from('studio_generations')
      .update({
        status: 'ready',
        finished_at: new Date().toISOString(),
        cost_credits: charged,
      })
      .eq('id', generationId)
      .eq('workspace_id', workspace.id)

    revalidateBalance()
    revalidatePath('/studio')
    revalidatePath('/assets')
    return { ok: true, generationId, balanceAfter: credits.data.balanceAfter }
  } catch (error) {
    reportServerError(error, { action: 'queueGeneration', workspaceId })
    return { ok: false, insufficient: false, message: REFUSALS.failed }
  }
}

/** One generation and its images, for the screen. Parsed per row. */
export async function readGeneration(
  id: unknown,
): Promise<
  | { ok: true; generation: ReturnType<typeof StudioGenerationSchema.parse> }
  | { ok: false; message: string }
> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { ok: false, message: 'That image request does not exist.' }

  const ws = await workspaceForWrite()
  if (!ws.ok) return { ok: false, message: ws.message }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('studio_generations')
    .select('*')
    .eq('workspace_id', ws.workspace.id)
    .eq('id', parsed.data)
    .maybeSingle()

  if (error) return { ok: false, message: 'Sahoda could not read that image request just now.' }
  if (!data) return { ok: false, message: 'That image request does not exist.' }

  const row = StudioGenerationSchema.safeParse(data)
  if (!row.success) {
    reportServerError(new Error('studio: generation row did not parse'), {
      action: 'readGeneration',
    })
    return { ok: false, message: 'Sahoda could not read that image request just now.' }
  }
  return { ok: true, generation: row.data }
}
