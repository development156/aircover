import 'server-only'

import { cache } from 'react'

import { signMediaPreviews } from '@/lib/posts/media-url'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The workspace's logo, for the brand control in the topbar.
 *
 * ── THE POINTER IS THE ANSWER, WHEN IT EXISTS ───────────────────────────────
 * `workspaces.logo_asset_id` names the exact asset row the workspace chose.
 * When that column is present and holds a non-null id, this reads that row,
 * not the newest thing titled `Logo`. That is the whole point of the pointer:
 * two people renaming files in the library at the same moment can no longer
 * change whose picture the topbar shows.
 *
 * A pointer at a TRASHED asset answers null rather than falling back to the
 * title match. The pointer is an explicit choice, made by `setBrandLogo` or
 * the migration's backfill; silently substituting a different file for it is
 * the "it says it worked and nothing changed" shape this area has already
 * been burned by once (see the trash filter below). A person who deleted
 * their logo sees the colour chip until they pick a new one, which is the
 * honest state.
 *
 * ── FOUND BY TITLE, AND THAT IS THE FALLBACK NOW ─────────────────────────────
 * Before the pointer existed, onboarding uploaded the logo into the assets
 * library with the title `Logo`, because there was no column and no row to
 * point at. This reads the NEWEST image in the library titled `Logo`, which is
 * exactly what the upload wrote and exactly what "replace my logo" writes over
 * it. The compromise is real and worth naming: a customer who titles some
 * other picture `Logo` by hand in the library would see it here. That is
 * visible, reversible and costs them nothing, which is why it was an
 * acceptable price before the pointer shipped.
 *
 * The fallback still runs today, for two reasons that will both stay true for
 * a while: the migration adding the column needs a human to apply it
 * (`supabase db push`), so this code has to work with the column absent; and
 * the backfill that runs when it is applied only finds a match for a
 * workspace whose newest asset was already titled `Logo`, so anyone else
 * still needs this path after the migration too.
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

/** Sign and shape the row this function ultimately returns. */
async function toBrandLogo(row: { id: string; storage_path: string }): Promise<BrandLogo> {
  const [preview] = await signMediaPreviews([{ id: row.id, storage_path: row.storage_path }])
  return { assetId: row.id, url: preview?.url ?? null }
}

/**
 * The title-match fallback. Unchanged from before the pointer existed, so
 * every workspace the backfill did not reach keeps working exactly as it did.
 */
async function readBrandLogoByTitle(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
): Promise<BrandLogo | null> {
  const { data, error } = await supabase
    .from('assets')
    .select('id, storage_path, title, kind, created_at')
    .eq('workspace_id', workspaceId)
    .eq('kind', 'image')
    .eq('title', LOGO_TITLE)
    /**
     * A logo in the TRASH is not the logo. Without this, deleting the logo
     * left it painting the topbar for ever, and, worse, hid a newer one
     * behind it, because the trashed row could still be the most recent.
     * Found by review; `assets` marks deletion with `deleted_at`, not a row
     * removal, so every read of that table has to say which it wants.
     */
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return toBrandLogo(data as { id: string; storage_path: string })
}

export const readBrandLogo = cache(async function readBrandLogo(
  workspaceId: string,
): Promise<BrandLogo | null> {
  try {
    const supabase = createServerSupabase()

    /**
     * ── THE POINTER, ATTEMPTED FIRST ───────────────────────────────────────
     * `42703` is "undefined column": the migration has not been applied on
     * this deploy. That is not a failure to report, it is the expected shape
     * before a human runs `supabase db push`, so it falls straight through to
     * the title match below rather than answering null.
     *
     * ANY OTHER read failure answers null instead of falling back, and that is
     * the deliberate half. The pointer exists because the title match can name
     * the wrong file; a read that did not answer leaves us unable to say which
     * file was chosen, and guessing by title there could paint somebody else's
     * picture into the topbar. The colour chip is the honest answer to "we
     * could not find out".
     */
    const workspace = await supabase
      .from('workspaces')
      .select('logo_asset_id')
      .eq('id', workspaceId)
      .maybeSingle()

    if (workspace.error && workspace.error.code !== '42703') return null

    const pointerId =
      !workspace.error && workspace.data
        ? ((workspace.data as { logo_asset_id: string | null }).logo_asset_id ?? null)
        : null

    if (pointerId !== null) {
      const pointed = await supabase
        .from('assets')
        .select('id, storage_path, deleted_at')
        .eq('id', pointerId)
        .eq('workspace_id', workspaceId)
        .maybeSingle()

      if (pointed.error && pointed.error.code !== '42703') return null

      if (!pointed.error && pointed.data) {
        const row = pointed.data as { id: string; storage_path: string; deleted_at: string | null }
        // A pointer at a trashed asset is not the logo. See the file header
        // for why this returns null rather than falling back to the title.
        if (row.deleted_at !== null) return null
        return await toBrandLogo(row)
      }
    }

    return await readBrandLogoByTitle(supabase, workspaceId)
  } catch {
    return null
  }
})

/**
 * The workspace's DARK-background logo variant, or null.
 *
 * ── POINTER ONLY, DELIBERATELY ────────────────────────────────────────────────
 * There is no title-match fallback here, unlike `readBrandLogo` above. That
 * fallback exists for the light variant because a title convention (`Logo`)
 * predates the pointer column and needs to keep answering while the pointer's
 * own migration is unapplied on some deploys. No workspace has ever been asked
 * for a dark variant before `workspaces.logo_asset_id_dark` existed, so there is
 * no prior signal to fall back to, and guessing which OTHER asset in the
 * library might be the dark variant would be exactly the "a customer who titles
 * some other picture" risk `readBrandLogo`'s own header names.
 *
 * ── NULL IS AN ANSWER, NOT A FAILURE ────────────────────────────────────────
 * No dark variant chosen, a column that does not exist yet (`42703`), a pointer
 * at a trashed asset, a read that did not answer: every one of them returns
 * null. A caller that wants a mark for a dark surface and gets null here uses
 * the light variant instead (see `logo-variant-pick.ts`) or falls back to
 * whatever it did before this column existed.
 */
export const readBrandLogoDark = cache(async function readBrandLogoDark(
  workspaceId: string,
): Promise<BrandLogo | null> {
  try {
    const supabase = createServerSupabase()

    const workspace = await supabase
      .from('workspaces')
      .select('logo_asset_id_dark')
      .eq('id', workspaceId)
      .maybeSingle()

    // Any failure, including `42703` (column not applied yet), answers null:
    // there is no fallback path to fall through to for this variant.
    if (workspace.error || !workspace.data) return null

    const pointerId = (workspace.data as { logo_asset_id_dark: string | null }).logo_asset_id_dark
    if (pointerId === null || pointerId === undefined) return null

    const pointed = await supabase
      .from('assets')
      .select('id, storage_path, deleted_at')
      .eq('id', pointerId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (pointed.error || !pointed.data) return null

    const row = pointed.data as { id: string; storage_path: string; deleted_at: string | null }
    // A pointer at a TRASHED asset is not the logo. Same rule as the light
    // variant's pointer path.
    if (row.deleted_at !== null) return null

    return await toBrandLogo(row)
  } catch {
    return null
  }
})

export interface BrandLogoVariants {
  /** The light-background variant. Also the ONLY variant for a single-logo workspace. */
  light: BrandLogo | null
  /** The dark-background variant. Null for the overwhelming majority of workspaces. */
  dark: BrandLogo | null
}

/**
 * Both logo variants a workspace may hold, read together.
 *
 * Added alongside `readBrandLogo` rather than in place of it: every existing
 * caller (the topbar, the brand panel) wants exactly the one answer
 * `readBrandLogo` already gives, and changing what that function returns would
 * be the "one variant only must keep working exactly as today" regression this
 * column set out to avoid. This is for a caller that genuinely wants both, such
 * as the stamping pipeline choosing which file fits a given picture.
 */
export const readBrandLogoVariants = cache(async function readBrandLogoVariants(
  workspaceId: string,
): Promise<BrandLogoVariants> {
  const [light, dark] = await Promise.all([
    readBrandLogo(workspaceId),
    readBrandLogoDark(workspaceId),
  ])
  return { light, dark }
})
