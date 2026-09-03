'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

import { reportServerError } from '@/lib/observability/report'
import { setLogoVariant, type SetLogoVariantState } from '@/lib/brand/set-logo-variant'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * Make a file the workspace's logo, in either of its two variants.
 *
 * ── WHY THIS EXISTS AND `uploadAsset` DOES NOT SUFFICE ──────────────────────
 * Founder's report, three times over two days: "Replace logo is not working."
 * It was not working, and it COULD NOT HAVE WORKED for him, for a reason no
 * amount of error-handling in the panel would have fixed.
 *
 * His logo was already in the library. It went in during onboarding, before the
 * title fix in `ba47a1a3`, so it was stored under its FILE NAME rather than the
 * title `Logo` that `readBrandLogo` searches for. The topbar therefore showed a
 * colour chip. He pressed "Replace logo", chose the same file, and `uploadAsset`
 * refused it as a DUPLICATE — correctly, by content hash, because the bytes were
 * already there.
 *
 * So the one action that could have made his logo findable was the one action
 * guaranteed to fail. Every press, for ever.
 *
 * ── THE DISTINCTION `uploadAsset` CANNOT MAKE ───────────────────────────────
 * Refusing a duplicate is right for a MEDIA LIBRARY: a second copy of the same
 * photo is waste, and the refusal names the existing one so a person can find
 * it. It is wrong for THIS control, whose meaning is not "add a file" but "this
 * is my logo". If the bytes are already here, that request is not only valid,
 * it is already half-satisfied.
 *
 * So: hash first, and if the workspace already holds these bytes, ADOPT that
 * row — retitle it, and take it out of the trash if that is where it is.
 * Otherwise hand over to `uploadAsset` unchanged, duplicate check and all.
 * `uploadAsset` is left exactly as it was: the library's policy is right for
 * the library; this is the logo's policy, and it lives in
 * `lib/brand/set-logo-variant.ts`, which this file is a thin wrapper over.
 *
 * ── THE TWO ACTIONS BELOW ────────────────────────────────────────────────────
 * `setBrandLogo` is the light-background (and, for a workspace with only one
 * file, the ONLY) variant — its name and behaviour are unchanged from before a
 * second variant existed. `setBrandLogoDark` is new: the dark-background
 * variant, stored under its own title and pointed at through its own column
 * (`workspaces.logo_asset_id_dark`), so setting one never touches the other.
 */

export type SetBrandLogoState = SetLogoVariantState

async function run(formData: FormData, kind: 'light' | 'dark'): Promise<SetBrandLogoState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to set your logo.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const result = await setLogoVariant(workspaceId, formData, kind)
    if (result.ok) revalidatePath('/assets')
    return result
  } catch (error) {
    reportServerError(error, {
      action: kind === 'light' ? 'setBrandLogo' : 'setBrandLogoDark',
      workspaceId,
    })
    return { ok: false, message: 'Could not set that as your logo. Try again.' }
  }
}

/** The light-background logo variant. For a workspace with one file, its only logo. */
export async function setBrandLogo(formData: FormData): Promise<SetBrandLogoState> {
  return run(formData, 'light')
}

/** The dark-background logo variant. Optional; a workspace need never supply one. */
export async function setBrandLogoDark(formData: FormData): Promise<SetBrandLogoState> {
  return run(formData, 'dark')
}
