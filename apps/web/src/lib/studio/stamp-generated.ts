import 'server-only'

import type { StampOutcome, StampSizeStep } from '@sahoda/shared'

import { randomUUID } from 'node:crypto'

import { kindForProvenMime } from '@/lib/assets/kind'
import { readBrandLogo } from '@/lib/brand/logo'
import { readBrandLogoBytesVariants } from '@/lib/brand/logo-bytes'
import type { InkPolarity } from '@/lib/brand/logo-facts'
import type { Anchor } from '@/lib/brand/logo-placement'
import { oklchToRgb, parseOklch, relativeLuminance, type Rgb } from '@/lib/brand/oklch'
import { activeThemeTokens } from '@/lib/brand/read-theme'
import { CHANNEL_MEDIA_CAP_BYTES, MEDIA_BUCKET } from '@/lib/posts/media-constants'
import { assetObjectPath } from '@/lib/posts/media-path'
import { sniffImage } from '@/lib/posts/sniff-image'
import type { createServerSupabase } from '@/lib/supabase/server'

import type { AnchorChoice } from './corner-choice'
import { stampLogo } from './stamp'

/**
 * THE STAMPING STEP OF A GENERATION, AS ONE CALL THE ACTION CAN MAKE SAFELY.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * `stamp.ts` turns pixels into pixels and touches nothing else. `logo-bytes.ts`
 * reads a file and measures it. Between them sits the wiring a generation needs:
 * read the logo, work out the plate colour from the workspace's Brand Skin,
 * composite, store the result as its own asset. That is fifty lines, and the
 * place it would otherwise live is inside a `withCredits` callback inside a loop
 * inside `actions/studio.ts`, which is already the longest action in the app.
 * Here it can be read, and proven, on its own.
 *
 * ── THE RULE THAT OUTRANKS EVERYTHING ELSE HERE ─────────────────────────────
 * A STAMP FAILURE IS NEVER A GENERATION FAILURE. Somebody paid for the picture.
 * No logo, a logo that will not decode, a mark that will not fit, an upload that
 * fails, a row that will not insert: every one of them loses the stamp and keeps
 * the picture, and the generation still reports success.
 *
 * That guarantee is owned HERE and nowhere else, deliberately. The caller runs
 * inside a `withCredits` callback where a throw releases the hold and turns into
 * refusal copy, so this function is total: one try around the whole body, `null`
 * for every failure, nothing thrown for any input. There is no second wrapper at
 * the call site, because two owners of one guarantee means neither is tested.
 * `stamp-generated.test.ts` proves the totality directly and
 * `studio.stamp.test.ts` proves it through the action.
 *
 * ── AND IT COSTS NOTHING ────────────────────────────────────────────────────
 * Stamping is local compute, not a provider call. Nothing here touches the
 * ledger, `creditsCharged` or the running charge total, and it takes no ledger
 * port. A picture that was stamped costs exactly what the same picture costs
 * unstamped.
 *
 * ── THE STAMPED COPY IS A NEW ASSET, NEVER AN OVERWRITE ─────────────────────
 * The model's original keeps its object, its `assets` row and its place on
 * `studio_generation_images.asset_id`. The stamped picture is an ADDITIONAL row
 * pointing at an ADDITIONAL object. Overwriting would destroy un-stamped bytes
 * the customer paid for, and a logo is a decision they may want to reverse.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * It does not title the new row. `readBrandLogo` finds a workspace's logo by the
 * title `Logo`, so a stamped picture carrying that title would become the
 * workspace's logo and every later generation would stamp itself with the last
 * picture it drew. It does not write `studio_generation_images` either: that row
 * is the caller's, is append-only in the database, and has to be written once
 * with everything on it.
 */

/**
 * What the caller records when a stamped copy EXISTS.
 *
 * Reached only through `StampResult` below — this module no longer answers with
 * null, because null was one word for four situations and the screen that reads
 * it has to tell them apart.
 */
export interface StampedPicture {
  assetId: string
  /** Whether a plate was drawn behind the mark, for a screen that wants to say so. */
  plated: boolean
  /**
   * What the renderer did with the customer's chosen corner: kept it, or moved
   * the mark to a quieter or more legible one. Carried out of `stampLogo`
   * unchanged so the CALLER can record it beside the pointer, and the result
   * screen can say so rather than showing a mark in a corner nobody chose. The
   * caller is the only place that also knows the corner the customer ASKED for,
   * which is what an `as_chosen` result needs to name the anchor at all.
   */
  anchorChoice: AnchorChoice
  /**
   * Where the bytes landed, so the CALLER can undo this write.
   *
   * Returned as of the 2026-09-01 merge with `wt-core`, which gave the
   * `studio_generation_images` insert an error check that rolls the generation
   * back. Rolling back the generation's own asset while leaving the stamped one
   * standing would put a picture in somebody's library for a generation they
   * were refunded for — an orphan with a thumbnail, which is worse than an
   * orphan nobody can see. This module cannot do that undo itself: it returns
   * before the caller's row is attempted and has no way to learn the outcome.
   */
  objectPath: string
}

/**
 * Every picture a business publishes carries its mark in the SAME corner.
 *
 * Fixed rather than chosen per picture, and that is the point: a mark that moves
 * between posts reads as an accident, and a reader recognising a brand at a
 * glance in a feed is worth more than finding the emptiest corner of any one
 * image. Bottom-right because it is where a signature goes and where the least
 * platform chrome lands. When per-picture placement is ever wanted it belongs in
 * `logo-placement.ts` with the rest of the geometry, not as a caller's opinion.
 */
const STAMP_ANCHOR: Anchor = 'bottom-right'

/**
 * How far a candidate plate colour must sit from the middle before it is used.
 *
 * The plate exists to make the mark legible, so a plate that is nearly the same
 * lightness as the ink is worse than no plate at all. A brand whose canvas is a
 * mid grey therefore does not get its own colour here: it gets `stamp.ts`'s
 * default, which is white or near-black and cannot fail to separate.
 */
const PLATE_LIGHT_FLOOR = 0.6
const PLATE_DARK_CEILING = 0.4

type Supabase = ReturnType<typeof createServerSupabase>

function toHex(rgb: Rgb): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

/**
 * The plate colour, from the workspace's Brand Skin, or `undefined`.
 *
 * `surface[0]` is the canvas the brand chose to put its own marks on, which is
 * the closest thing the token set has to "the paper this logo was drawn for".
 * `studioPalette` reads the same token for the same role. There is no dedicated
 * plate token in `ThemeTokens`, so inventing one here would be a colour nobody
 * picked.
 *
 * `undefined` rather than a hex literal when the theme is missing, unreadable,
 * or the wrong side of the ink: `stamp.ts` owns the defaults (white behind dark
 * ink, near-black behind light ink) and stating them twice is how they drift.
 */
async function plateColour(workspaceId: string, ink: InkPolarity): Promise<string | undefined> {
  const tokens = await activeThemeTokens(workspaceId)
  const token = tokens?.surface[0]
  if (typeof token !== 'string' || token === '') return undefined

  let rgb: Rgb
  try {
    const { l, c, h } = parseOklch(token)
    if (![l, c, h].every(Number.isFinite)) return undefined
    rgb = oklchToRgb(l, c, h)
  } catch {
    // A theme row is customer data that has been through a jsonb column, so a
    // malformed colour is ordinary. The default plate is the answer, not a throw.
    return undefined
  }

  const luminance = relativeLuminance(rgb)
  // `mixed` ink works at neither extreme and is treated as dark ink, the same
  // ruling `stamp.ts` makes for its own default.
  const wantsDarkPlate = ink === 'light'
  const usable = wantsDarkPlate ? luminance <= PLATE_DARK_CEILING : luminance >= PLATE_LIGHT_FLOOR
  return usable ? toHex(rgb) : undefined
}

export interface StampGeneratedInput {
  workspaceId: string
  /** Who is generating, recorded as the stamped asset's author. */
  userId: string
  /** The picture as the provider returned it. Never modified. */
  picture: Uint8Array
  /** The caller's own client, so the write is scoped to the caller's token. */
  supabase: Supabase
  /**
   * Where the mark sits and how big it is, from the customer's own choice.
   *
   * Optional, and the defaults reproduce exactly what shipped before the
   * controls existed. Every caller that predates them keeps working.
   */
  anchor?: Anchor
  sizeStep?: StampSizeStep
}

/**
 * The answer, which is never null and never a throw.
 *
 * ── WHY THIS STOPPED BEING `StampedPicture | null` ──────────────────────────
 * It returned null for every failure, which was right about the caller's
 * obligation (keep the picture, charge once) and useless to the screen. The
 * migration's own step 5 forbids collapsing the reasons, and a function that
 * hands back one null cannot help anyone honour that. So the reason travels
 * with the answer and is written in the same insert that records the pointer.
 *
 * The value IS `StampOutcome` from `@sahoda/shared` — not a local copy — so the
 * database check constraint, the row schema and this module cannot drift apart.
 */
export type StampResult =
  ({ outcome: 'stamped' } & StampedPicture) | { outcome: Exclude<StampOutcome, 'stamped'> }

/**
 * Stamp the workspace's logo onto one generated picture and store the result.
 *
 * Always answers, never throws, for any input. A non-`stamped` outcome means the
 * caller keeps the model's original picture and charges once, exactly as before.
 */
export async function stampGeneratedPicture(input: StampGeneratedInput): Promise<StampResult> {
  const { supabase, workspaceId } = input
  let objectPath: string | null = null

  try {
    // BOTH variants, so `stampLogo` can choose the one that reads on this
    // picture rather than drawing a plate behind the only one it has.
    const variants = await readBrandLogoBytesVariants(workspaceId)
    const logo = variants.light ?? variants.dark
    if (logo === null) {
      // ── TWO SITUATIONS, AND THE REMEDIES ARE OPPOSITE ────────────────────
      // `readBrandLogoBytes` answers null both for a workspace with no logo and
      // for one whose logo file it could not decode. Telling somebody to add a
      // logo they already added is the impossible remedy this product forbids,
      // so the pointer is asked directly. This second read happens ONLY on a
      // path that already failed, and `readBrandLogo` is a single indexed row.
      const pointer = await readBrandLogo(workspaceId).catch(() => null)
      return { outcome: pointer === null ? 'no_logo' : 'logo_unreadable' }
    }

    // The OTHER variant, when there is one and it is not the one already
    // chosen above. `stampLogo` owns the pick because only it knows the
    // luminance under the mark; this hands it the material.
    const alt = variants.light !== null && variants.dark !== null ? variants.dark : null

    const stamped = await stampLogo({
      picture: input.picture,
      logo: logo.bytes,
      facts: logo.facts,
      anchor: input.anchor ?? STAMP_ANCHOR,
      sizeStep: input.sizeStep,
      alt: alt === null ? undefined : { bytes: alt.bytes, facts: alt.facts },
      plate: await plateColour(workspaceId, logo.facts.inkPolarity),
    })
    if (!stamped.ok) return { outcome: 'failed' }

    // The CHANNEL ceiling, not the upload cap. This PNG was produced by sharp
    // in this process, so the 4.5 MB request-body limit is irrelevant to it, and
    // the generation it stamps has already been charged for.
    if (stamped.png.byteLength === 0 || stamped.png.byteLength > CHANNEL_MEDIA_CAP_BYTES) {
      return { outcome: 'failed' }
    }

    // Facts from the bytes, through the same gate an upload passes. The stamped
    // file is a PNG by construction, and this is where that stops being an
    // assumption: the row records what the object actually is.
    const sniffed = sniffImage(stamped.png)
    if (!sniffed.ok) return { outcome: 'failed' }
    const kind = kindForProvenMime(sniffed.image.mime)
    if (kind === null) return { outcome: 'failed' }

    const assetId = randomUUID()
    objectPath = assetObjectPath({ workspaceId, assetId, mime: sniffed.image.mime })

    const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, stamped.png, {
      contentType: sniffed.image.mime,
      upsert: false,
    })
    if (upload.error) return { outcome: 'failed' }

    const row = await supabase.from('assets').insert({
      id: assetId,
      workspace_id: workspaceId,
      storage_path: objectPath,
      kind,
      mime: sniffed.image.mime,
      bytes: stamped.png.byteLength,
      width: sniffed.image.width,
      height: sniffed.image.height,
      created_by: input.userId,
    })
    if (row.error) {
      // The object is in storage and nothing points at it. Remove it rather than
      // leaving bytes nobody can reach or delete, exactly as the generation's own
      // asset write does one step earlier.
      await removeObject(supabase, objectPath)
      return { outcome: 'failed' }
    }

    return {
      outcome: 'stamped',
      assetId,
      plated: stamped.plated,
      objectPath,
      anchorChoice: stamped.anchorChoice,
    }
  } catch {
    // A thrown transport failure, a `MediaPathError`, anything at all. If the
    // object made it to storage before the throw, it is removed on the way out:
    // an orphan is the one outcome worse than losing the stamp.
    if (objectPath !== null) await removeObject(supabase, objectPath)
    return { outcome: 'failed' }
  }
}

/** Best effort, and never the reason anything fails. */
async function removeObject(supabase: Supabase, path: string): Promise<void> {
  try {
    await supabase.storage.from(MEDIA_BUCKET).remove([path])
  } catch {
    // Nothing left to try. The caller is already on its way to `null`.
  }
}
