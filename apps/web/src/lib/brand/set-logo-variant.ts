import 'server-only'

import { createHash } from 'node:crypto'

import { looksLikeSvg, rasteriseSvgLogo } from './svg-logo'
import { createServerSupabase } from '@/lib/supabase/server'
import { uploadAsset } from '@/app/actions/assets'

/**
 * SETTING A LOGO FILE, FOR EITHER OF THE TWO VARIANTS A WORKSPACE MAY HOLD.
 *
 * ── WHY THIS IS SHARED, AND WHY IT IS NOT A SERVER ACTION ITSELF ────────────
 * `apps/web/src/app/actions/brand-logo.ts` used to hold this logic once, for the
 * single logo a workspace could have. A second, dark-background variant needs
 * the exact same sequence — rasterise an SVG, adopt a file already in the
 * library by content hash, or upload a new one, then point the workspace at it
 * — with two things swapped: which title marks the asset in the library, and
 * which column on `workspaces` the pointer goes into. Parameterising on those
 * two keeps the sequence written once.
 *
 * It lives here, without `'use server'`, because a module carrying that
 * directive may only export async functions: `brand-logo.ts` stays the actual
 * action file and imports this.
 *
 * ── EVERY GUARANTEE `brand-logo.ts`'s OWN HEADER DESCRIBES STILL HOLDS ───────
 * A duplicate file by content hash is adopted rather than refused. An SVG is
 * rasterised to a PNG and the vector is discarded before anything else touches
 * it. Exactly one asset carries the variant's title at a time: `demoteOthers`
 * retitles the rest to their "(previous)" form rather than deleting them, so a
 * superseded file is still the customer's to find in the library.
 */

export type LogoVariantKind = 'light' | 'dark'

export type SetLogoVariantState =
  | { ok: true; adopted: boolean; converted: boolean }
  | { ok: false; message: string }

interface VariantConfig {
  /** The title that marks the current asset for this variant in the library. */
  title: string
  /** The title a superseded asset for this variant keeps. Still their file. */
  previousTitle: string
  /** The `workspaces` column this variant's pointer lives in. */
  pointerColumn: 'logo_asset_id' | 'logo_asset_id_dark'
}

/**
 * `logoVariantConfig('light')` matches `brand-logo.ts`'s pre-existing constants
 * exactly (`'Logo'` / `'Logo (previous)'` / `logo_asset_id`), so a workspace with
 * only the light variant behaves exactly as it did before this file existed.
 */
export function logoVariantConfig(kind: LogoVariantKind): VariantConfig {
  return kind === 'light'
    ? { title: 'Logo', previousTitle: 'Logo (previous)', pointerColumn: 'logo_asset_id' }
    : {
        title: 'Logo (dark)',
        previousTitle: 'Logo (dark, previous)',
        pointerColumn: 'logo_asset_id_dark',
      }
}

/**
 * Leave exactly one asset titled for this variant.
 *
 * A failure here is NOT fatal to setting the logo: the worst case is two rows
 * carrying the title, which costs nothing today because neither reader falls
 * back to a title match for the dark variant, and the light variant's own
 * fallback already tolerates it (see `logo.ts`). Refusing the whole act over it
 * would be worse.
 */
async function demoteOthers(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  config: VariantConfig,
  keepId: string | null,
): Promise<void> {
  try {
    const query = supabase
      .from('assets')
      .update({ title: config.previousTitle })
      .eq('workspace_id', workspaceId)
      .eq('title', config.title)

    await (keepId ? query.neq('id', keepId) : query)
  } catch {
    // Best effort, deliberately. See above.
  }
}

/**
 * Point the workspace at the asset that is now this variant's logo.
 *
 * Best effort, in the same sense `brand-logo.ts` documents for the light
 * variant: `42703` (undefined column) is exactly what an unapplied migration
 * answers with, and setting the logo must not start failing because a human has
 * not yet run `supabase db push`. supabase-js RETURNS `{ error }` rather than
 * throwing, so it is the discarded result that swallows that, not the `catch` —
 * the `catch` is here only for a thrown transport failure.
 */
async function pointWorkspaceAtVariant(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  config: VariantConfig,
  assetId: string,
): Promise<void> {
  try {
    await supabase
      .from('workspaces')
      .update({ [config.pointerColumn]: assetId })
      .eq('id', workspaceId)
  } catch {
    // Best effort, deliberately. See above.
  }
}

/** `brand.svg` -> `brand`. The stored file is a PNG and its name should say so. */
function baseName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  const stem = trimmed.replace(/\.[^.]+$/, '')
  return stem === '' ? 'logo' : stem
}

/**
 * Make a file one of the workspace's logo variants.
 *
 * `workspaceId` is read by the caller (a server action, already holding an
 * authenticated write handle) rather than here, so this file makes no
 * assumption about how the caller establishes the workspace.
 */
export async function setLogoVariant(
  workspaceId: string,
  formData: FormData,
  kind: LogoVariantKind,
): Promise<SetLogoVariantState> {
  const config = logoVariantConfig(kind)

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Pick a logo to use.' }
  }

  let bytes = new Uint8Array(await file.arrayBuffer())
  let payload = formData
  let converted = false

  // An SVG becomes a PNG here, and the SVG is discarded. See `brand-logo.ts`'s
  // header for the full reasoning; it applies identically to either variant.
  if (looksLikeSvg(bytes)) {
    const raster = await rasteriseSvgLogo(bytes)
    if (!raster.ok) return { ok: false, message: raster.message }

    bytes = raster.png
    converted = true
    payload = new FormData()
    payload.set('file', new File([raster.png], `${baseName(file.name)}.png`, { type: 'image/png' }))
    payload.set('title', config.title)
  }

  const contentHash = createHash('sha256').update(bytes).digest('hex')

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('assets')
    .select('id, deleted_at')
    .eq('workspace_id', workspaceId)
    .eq('content_sha256', contentHash)
    // A live row wins over a trashed one when the workspace holds both.
    .order('deleted_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle()

  // `42703`: `content_sha256` arrives with a migration a human applies. Where
  // the column is absent there is no hash to match on and uploading is the only
  // thing left to try. Any other read failure is reported, not silently
  // converted into a plain upload that would hit its own duplicate refusal.
  if (error && error.code !== '42703') {
    return { ok: false, message: 'Sahoda could not check your library. Try again.' }
  }

  const existing = data as { id: string; deleted_at: string | null } | null
  if (existing) {
    // Demote first, or adoption is a lie: retitling an OLDER row while a newer
    // one still carries the title would report success while nothing visible
    // changed.
    await demoteOthers(supabase, workspaceId, config, existing.id)

    const { error: claimed } = await supabase
      .from('assets')
      .update({ title: config.title, deleted_at: null })
      .eq('id', existing.id)
      .eq('workspace_id', workspaceId)

    if (claimed) return { ok: false, message: 'Could not set that as your logo. Try again.' }

    await pointWorkspaceAtVariant(supabase, workspaceId, config, existing.id)

    return { ok: true, adopted: true, converted }
  }

  // A NEW upload becomes the newest row by construction, so demoting the others
  // is belt and braces there — but it keeps the invariant "exactly one asset
  // carries this variant's title" true.
  await demoteOthers(supabase, workspaceId, config, null)

  const stored = await uploadAsset(payload)
  if (!stored.ok) return { ok: false, message: stored.message }

  await pointWorkspaceAtVariant(supabase, workspaceId, config, stored.asset.id)

  return { ok: true, adopted: false, converted }
}
