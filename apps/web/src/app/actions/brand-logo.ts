'use server'

import { createHash } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

import { reportServerError } from '@/lib/observability/report'
import { looksLikeSvg, rasteriseSvgLogo } from '@/lib/brand/svg-logo'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

import { uploadAsset } from './assets'

/**
 * Make a file the workspace's logo.
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
 * row — retitle it `Logo`, and take it out of the trash if that is where it is.
 * Otherwise hand over to `uploadAsset` unchanged, duplicate check and all.
 *
 * `uploadAsset` is left exactly as it was. The library's policy is right for the
 * library; this is the logo's policy, and it lives with the logo.
 */

export type SetBrandLogoState =
  { ok: true; adopted: boolean; converted: boolean } | { ok: false; message: string }

const LOGO_TITLE = 'Logo'

/** The label a superseded logo keeps. It is still their file. */
const PREVIOUS_LOGO_TITLE = 'Logo (previous)'

/**
 * Leave exactly one asset titled `Logo`.
 *
 * A failure here is NOT fatal to setting the logo: the worst case is two rows
 * carrying the title and `readBrandLogo` picking the newer, which is the
 * behaviour we want anyway. Refusing the whole act over it would be worse.
 */
async function demoteOtherLogos(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  keepId: string | null,
): Promise<void> {
  try {
    const query = supabase
      .from('assets')
      .update({ title: PREVIOUS_LOGO_TITLE })
      .eq('workspace_id', workspaceId)
      .eq('title', LOGO_TITLE)

    await (keepId ? query.neq('id', keepId) : query)
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

export async function setBrandLogo(formData: FormData): Promise<SetBrandLogoState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to set your logo.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: 'Pick a logo to use.' }
    }

    let bytes = new Uint8Array(await file.arrayBuffer())
    let payload = formData
    let converted = false

    /**
     * ── AN SVG BECOMES A PNG HERE, AND THE SVG IS DISCARDED ─────────────────
     * The founder's logo is an SVG, and the file dialog would not even let him
     * select one — a third, separate "nothing happens".
     *
     * `lib/assets/kind.ts` had the reason and it is correct: "an SVG is a script
     * container that no channel accepts". Rather than sanitise it — a blacklist
     * is defeatable and a whitelist sanitiser is its own piece of software with
     * its own CVE history — the vector is RASTERISED and the original thrown
     * away. Nothing that reaches storage, a signed link, a browser or a model is
     * ever an SVG.
     *
     * Everything downstream then works unchanged: the bytes sniff as a PNG, the
     * Constraint Engine can judge them, the library can hold them and image
     * generation can use them. `kind.ts`'s objection is answered rather than
     * routed around, which is why this needs no exception anywhere else.
     *
     * The hash is taken AFTER conversion, of what is actually stored, so
     * re-uploading the same SVG produces the same PNG and adopts rather than
     * duplicating.
     */
    if (looksLikeSvg(bytes)) {
      const raster = await rasteriseSvgLogo(bytes)
      if (!raster.ok) return { ok: false, message: raster.message }

      bytes = raster.png
      converted = true
      payload = new FormData()
      payload.set(
        'file',
        new File([raster.png], `${baseName(file.name)}.png`, { type: 'image/png' }),
      )
      payload.set('title', LOGO_TITLE)
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

    /**
     * A read that FAILED is not "no match". Falling through to `uploadAsset`
     * here would hit its own duplicate check and refuse, which is the exact
     * dead end this function exists to end — so an unreadable answer is
     * reported rather than silently converted into the old behaviour.
     *
     * `42703` is the one exception: `content_sha256` arrives with a migration a
     * human applies, and where the column is absent there is no hash to match
     * on and uploading is the only thing left to try.
     */
    if (error && error.code !== '42703') {
      return { ok: false, message: 'Sahoda could not check your library. Try again.' }
    }

    const existing = data as { id: string; deleted_at: string | null } | null
    if (existing) {
      /**
       * ── DEMOTE FIRST, OR ADOPTION IS A LIE ────────────────────────────────
       * Found by two independent review lenses. `readBrandLogo` takes the
       * NEWEST row titled `Logo`, so retitling an OLDER row reported success
       * while the topbar went on showing the previous logo — exactly the "it
       * says it worked and nothing changed" shape this whole sequence has been
       * chasing.
       *
       * So exactly one row carries the title. The others are not deleted, they
       * are demoted: a previous logo is still the customer's file and still
       * theirs to find in the library, and the label says what it is.
       */
      await demoteOtherLogos(supabase, workspaceId, existing.id)

      const { error: claimed } = await supabase
        .from('assets')
        .update({ title: LOGO_TITLE, deleted_at: null })
        .eq('id', existing.id)
        .eq('workspace_id', workspaceId)

      if (claimed) return { ok: false, message: 'Could not set that as your logo. Try again.' }

      revalidatePath('/assets')
      return { ok: true, adopted: true, converted }
    }

    // A NEW upload becomes the newest row by construction, so demoting the
    // others is belt and braces there — but it keeps the invariant "exactly one
    // asset is titled Logo" true, which is what makes the read unambiguous.
    await demoteOtherLogos(supabase, workspaceId, null)

    // Not here yet, so it is an ordinary upload — with every check that carries,
    // including the sniffing that proves the bytes are an image at all.
    const stored = await uploadAsset(payload)
    if (!stored.ok) return { ok: false, message: stored.message }

    return { ok: true, adopted: false, converted }
  } catch (error) {
    reportServerError(error, { action: 'setBrandLogo', workspaceId })
    return { ok: false, message: 'Could not set that as your logo. Try again.' }
  }
}
