'use server'

import { auth } from '@clerk/nextjs/server'
import { creditCost } from '@sahoda/shared'

import { attachAssetToPost } from '@/app/actions/assets'
import { queueGeneration } from '@/app/actions/studio'
import { reportServerError } from '@/lib/observability/report'
import type { ChargeFailureState } from '@/lib/posts/charge-failure'
import { signMediaPreviews } from '@/lib/posts/media-url'
import { getPost } from '@/lib/posts/read'
import { revalidatePostSurfaces } from '@/lib/posts/revalidate-surfaces'
import { chooseSettings } from '@/lib/studio/auto-settings'
import { imageActionFor } from '@/lib/studio/models'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * ONE PICTURE FOR ONE PLANNED POST, WITH THE STUDIO'S SETTINGS CHOSEN FOR IT.
 *
 * "Plan my week with pictures" calls this once per drafted post, in order, from
 * the screen. One action per post rather than one for the week, because a
 * picture takes between eight seconds and three minutes and the person should
 * see each one land as it does, and because each picture is its own charge:
 * `queueGeneration` holds and debits per picture, so a failure on the third
 * post leaves the first two paid for and delivered and the third released.
 *
 * ── THE SETTINGS ARE THE SCREEN'S OWN RULES ──────────────────────────────────
 * `chooseSettings` picks the shape from the post's channels through the same
 * `formatsForChannel` the picker offers, the on-brand mode, the everyday model,
 * and the post's own words as the brief. Nothing here can reach a size or a
 * model the Studio screen would refuse, because the request goes through
 * `queueGeneration` and every one of its gates.
 *
 * ── THE PICTURE IS ATTACHED, OR THE PERSON IS TOLD WHERE IT IS ───────────────
 * The generated asset is attached to the post through `attachAssetToPost`,
 * which applies the per-channel media rules. If that attach is refused, the
 * picture still exists in the library and was paid for, and the sentence says
 * exactly that rather than "failed".
 */
export type IllustrateState =
  | {
      ok: true
      postId: string
      assetId: string
      /** Signed, short-lived, for the reveal card. Null when signing failed. */
      previewUrl: string | null
      formatLabel: string
      creditsCharged: number
      balanceAfter: number
      /** True when the picture is in the library but the post refused it. */
      attachRefused: boolean
      message?: string
    }
  | { ok: false; insufficient: false; message: string }
  | ChargeFailureState

const REFUSALS = {
  signedOut: 'Sign in to make pictures.',
  noPost: 'That draft is not here any more, so no picture was made and nothing was charged.',
  noWords:
    'This draft has no words yet, so Sahoda did not make a picture for it and nothing was charged.',
  noFormat:
    'This draft has no channel a picture can be sized for, so nothing was made and nothing was charged.',
  notFound: 'The picture was made but Sahoda could not find it afterwards. It is in your library.',
} as const

export async function illustratePost(postId: unknown): Promise<IllustrateState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, insufficient: false, message: REFUSALS.signedOut }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, insufficient: false, message: ws.message }
    workspaceId = ws.workspace.id

    if (typeof postId !== 'string') {
      return { ok: false, insufficient: false, message: REFUSALS.noPost }
    }
    const post = await getPost(postId)
    if (post === null) return { ok: false, insufficient: false, message: REFUSALS.noPost }

    const chosen = chooseSettings({ title: post.title, body: post.body, channels: post.channels })
    if (!chosen.ok) {
      return {
        ok: false,
        insufficient: false,
        message: chosen.reason === 'no_words' ? REFUSALS.noWords : REFUSALS.noFormat,
      }
    }
    const { settings } = chosen

    // Every gate the Studio screen applies runs inside this call, and so does
    // the hold and the debit. Nothing is charged before this line.
    const made = await queueGeneration({
      mode: settings.mode,
      wanted: settings.wanted,
      formatId: settings.formatId,
      modelId: settings.modelId,
      referenceAssetIds: [],
      count: 1,
    })
    if (!made.ok) return made

    // The picture this generation produced. The stamped copy carries the logo
    // and is what a person would attach by hand; the bare one is the fallback
    // when no logo was placed.
    const supabase = createServerSupabase()
    const { data: image } = await supabase
      .from('studio_generation_images')
      .select('asset_id, stamped_asset_id')
      .eq('workspace_id', ws.workspace.id)
      .eq('generation_id', made.generationId)
      .order('idx', { ascending: true })
      .limit(1)
      .maybeSingle()
    const assetId =
      (typeof image?.stamped_asset_id === 'string' ? image.stamped_asset_id : null) ??
      (typeof image?.asset_id === 'string' ? image.asset_id : null)
    const action = imageActionFor(settings.modelId)
    const creditsCharged = action === null ? 0 : creditCost(action)
    if (assetId === null) {
      // Paid and made, but unattached: say so, never "failed".
      return { ok: false, insufficient: false, message: REFUSALS.notFound }
    }

    const attached = await attachAssetToPost(postId, assetId)

    const { data: row } = await supabase
      .from('assets')
      .select('id, storage_path')
      .eq('id', assetId)
      .maybeSingle()
    const signed =
      row && typeof row.storage_path === 'string'
        ? await signMediaPreviews([{ id: assetId, storage_path: row.storage_path }])
        : []
    const previewUrl = signed[0]?.url ?? null

    revalidatePostSurfaces(postId)

    return {
      ok: true,
      postId,
      assetId,
      previewUrl,
      formatLabel: settings.formatLabel,
      creditsCharged,
      balanceAfter: made.balanceAfter,
      attachRefused: !attached.ok,
      message: attached.ok
        ? undefined
        : `The picture is in your library, but this draft did not take it: ${attached.message}`,
    }
  } catch (error) {
    reportServerError(error, { action: 'illustratePost', workspaceId })
    return {
      ok: false,
      insufficient: false,
      message: 'Sahoda could not make this picture. Nothing was charged.',
    }
  }
}
