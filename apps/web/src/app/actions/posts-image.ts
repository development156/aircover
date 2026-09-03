'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, type Mesh } from '@sahoda/mesh'
import { ImageGenerateInputSchema, MESH_TASK_ACTION, type WithCreditsFn } from '@sahoda/shared'
import { revalidatePath } from 'next/cache'

import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { reportServerError } from '@/lib/observability/report'
import { decideAttach } from '@/lib/posts/attach-decision'
import {
  chargeFailureState,
  FAILURE_REASON,
  type ChargeFailureState,
} from '@/lib/posts/charge-failure'
import { CHANNEL_MEDIA_CAP_BYTES, MEDIA_BUCKET } from '@/lib/posts/media-constants'
import { mediaObjectPath } from '@/lib/posts/media-path'
import { newImageGenerateRef } from '@/lib/posts/object-ref'
import { getPost, listMedia, readVariantFormats } from '@/lib/posts/read'
import { sniffImage } from '@/lib/posts/sniff-image'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

// 'use server' modules may export only async functions — these singletons stay
// module-private. Built lazily so a missing key surfaces as a typed error inside
// the action rather than an import-time crash that 500s every route.
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

export type GenerateImageState =
  | { ok: true; storagePath: string; balanceAfter: number }
  // The two failure arms come from `ChargeFailureState`, shared with every other
  // paid action: an insufficient balance carries the exact shortfall so the UI can
  // route to top-up, and everything else carries copy. Restating them here would
  // let this action drift from the one place that decides whether a failure was
  // charged.
  | ChargeFailureState

/**
 * Generate an image and attach it to a post.
 *
 * ── METERED EXACTLY LIKE THE OTHER FOUR AI ENTRYPOINTS ───────────────────────
 * `withCredits` reserves the credits, the work runs inside the callback, and a
 * throw in there RELEASES the hold so nothing is charged. The action string comes
 * from `MESH_TASK_ACTION`, never a literal — the mesh task is `image_generate`
 * and the pricing key is `image_standard`, and hardcoding either invites the
 * silent mismatch that map exists to prevent.
 *
 * The object ref is SERVER-DERIVED and fresh per invocation. A stable ref (the
 * post id) would let a second generate replay the spent HOLD+DEBIT — no charge,
 * but the paid provider call still runs.
 *
 * ── THE GENERATED IMAGE GOES THROUGH THE SAME GATE AS AN UPLOAD ──────────────
 * `sniffImage` reads the real format and dimensions from the BYTES, and
 * `decideAttach` scores them against every selected channel — the identical path
 * a human upload takes. That is deliberate: a model that says PNG and returns
 * WebP, or returns 512×512 when asked for 1024, produces a file Instagram refuses
 * at publish time. Catching it here costs one rejected attach; catching it there
 * costs a customer a post that silently never went out.
 *
 * Validation happens INSIDE the credit callback, so an unusable image releases
 * the hold rather than charging for something that cannot be attached.
 */
export async function generateImage(postId: string, input: unknown): Promise<GenerateImageState> {
  const action = MESH_TASK_ACTION.image_generate
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, insufficient: false, message: 'Sign in to generate an image.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, insufficient: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const post = await getPost(postId)
    if (!post) {
      return { ok: false, insufficient: false, message: "You don't have access to this post." }
    }

    // Parsed BEFORE the callback: mesh does not validate input against the def's
    // schema, so an unparsed bad prompt would reserve credits and burn a paid
    // provider call on garbage.
    const parsedInput = ImageGenerateInputSchema.safeParse(input)
    if (!parsedInput.success) {
      return { ok: false, insufficient: false, message: 'Describe the image you want first.' }
    }

    const objectRef = newImageGenerateRef(workspace.id)
    const traceId = randomUUID()
    const existing = await listMedia(postId)

    let failure: string | null = null
    let delivered = false
    let storagePath = ''

    const credits = await getWithCredits()(
      { workspaceId: workspace.id, action, objectRef },
      async (ctx: { actionType: string; creditsCharged: number }) => {
        const result = await getMesh().runImage(parsedInput.data, {
          workspaceId: workspace.id,
          traceId,
          userId,
          actionType: ctx.actionType,
          creditsCharged: ctx.creditsCharged,
        })
        if (!result.ok) {
          // Our own copy, never `result.error.message` — that can carry provider text.
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('MESH_ERROR') // → RELEASE, no charge
        }

        const bytes = Uint8Array.from(Buffer.from(result.data.base64, 'base64'))
        // The CHANNEL ceiling, not the upload cap. These bytes came back from
        // the mesh inside this function; they never crossed the edge, so the
        // 4.5 MB request-body limit that lowered the upload cap says nothing
        // about them. Capping a generated image at the upload figure would fail
        // an ordinary large PNG on a path the customer already paid for.
        if (bytes.byteLength === 0 || bytes.byteLength > CHANNEL_MEDIA_CAP_BYTES) {
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('IMAGE_UNUSABLE') // → RELEASE
        }

        // Facts, not the model's claim. `result.data.mime` is deliberately unused.
        const sniffed = sniffImage(bytes)
        if (!sniffed.ok) {
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('IMAGE_UNREADABLE') // → RELEASE
        }

        // The same gate a human upload passes, against the same channels.
        const decision = decideAttach(
          post.channels,
          {
            mime: sniffed.image.mime,
            bytes: bytes.byteLength,
            width: sniffed.image.width,
            height: sniffed.image.height,
          },
          existing.length,
          // Per-channel, from `post_variants.format`. A story will not take a
          // landscape photo and a version that says one photo will not take a second.
          await readVariantFormats(postId),
        )
        if (!decision.ok) {
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('IMAGE_REJECTED') // → RELEASE: unusable is not a delivery
        }

        const supabase = createServerSupabase()
        const objectPath = mediaObjectPath({
          workspaceId: workspace.id,
          postId,
          objectId: randomUUID(),
          mime: sniffed.image.mime,
        })
        const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, bytes, {
          contentType: sniffed.image.mime,
          upsert: false,
        })
        if (upload.error) {
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('STORAGE_FAILED') // → RELEASE
        }

        const { error } = await supabase.from('post_media').insert({
          workspace_id: workspace.id,
          post_id: postId,
          storage_path: objectPath,
          mime: sniffed.image.mime,
          bytes: bytes.byteLength,
          width: sniffed.image.width,
          height: sniffed.image.height,
        })
        if (error) {
          // The object is already in the bucket. Remove it rather than leave an
          // orphan nothing references and nothing will ever clean up.
          await supabase.storage.from(MEDIA_BUCKET).remove([objectPath])
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('ATTACH_FAILED') // → RELEASE
        }

        storagePath = objectPath
        // Last statement before the return: from here the wrapper owns the
        // outcome, and any failure it reports may still have debited.
        delivered = true
        return { objectPath }
      },
    )

    if (credits.ok || delivered) revalidateBalance()

    if (!credits.ok) {
      return chargeFailureState({ error: credits.error, action, delivered, reason: failure })
    }

    revalidatePath(`/posts/${postId}`)
    return { ok: true, storagePath, balanceAfter: credits.data.balanceAfter }
  } catch (error) {
    reportServerError(error, { action: 'generateImage', workspaceId })
    return { ok: false, insufficient: false, message: 'Could not generate an image. Try again.' }
  }
}
