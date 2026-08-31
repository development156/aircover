import 'server-only'

import { cache } from 'react'

import { signMediaPreviews } from '@/lib/posts/media-url'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The workspace's logo, for the brand control in the topbar.
 *
 * ── FOUND BY TITLE, AND THAT IS A KNOWN COMPROMISE ──────────────────────────
 * Onboarding uploads the logo into the assets library with the title `Logo`,
 * because there is no logo column and no asset row to point at: adding either is
 * a migration, and a migration is a founder decision rather than a lane's.
 *
 * So this reads the NEWEST image in the library titled `Logo`, which is exactly
 * what the upload wrote and exactly what "replace my logo" writes over it. The
 * compromise is real and worth naming: a customer who titles some other picture
 * `Logo` by hand in the library would see it here. That is visible, reversible
 * and costs them nothing, which is why it is an acceptable price for not
 * inventing a schema change tonight. When a `workspaces.logo_asset_id` exists,
 * this function is the one place that changes.
 *
 * ── NULL IS AN ANSWER, NOT A FAILURE ────────────────────────────────────────
 * A workspace with no logo, a read that did not answer and a signing failure all
 * return null, and the control renders its colour chip instead. A signed link is
 * minted per request and dies within the hour, so it is never cached anywhere
 * that outlives it.
 */

export interface BrandLogo {
  assetId: string
  /** A signed link, good for the hour. Null when signing failed. */
  url: string | null
}

const LOGO_TITLE = 'Logo'

export const readBrandLogo = cache(async function readBrandLogo(
  workspaceId: string,
): Promise<BrandLogo | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('assets')
      .select('id, storage_path, title, kind, created_at')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'image')
      .eq('title', LOGO_TITLE)
      /**
       * A logo in the TRASH is not the logo. Without this, deleting the logo
       * left it painting the topbar for ever, and — worse — hid a newer one
       * behind it, because the trashed row could still be the most recent.
       * Found by review; `assets` marks deletion with `deleted_at`, not a row
       * removal, so every read of that table has to say which it wants.
       */
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    const row = data as { id: string; storage_path: string }
    const [preview] = await signMediaPreviews([{ id: row.id, storage_path: row.storage_path }])

    return { assetId: row.id, url: preview?.url ?? null }
  } catch {
    return null
  }
})
