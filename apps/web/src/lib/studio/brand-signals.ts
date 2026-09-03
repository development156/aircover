import 'server-only'

import type { BrandSignal } from '@sahoda/shared'

import { readBrain } from '@/lib/brand/read-brain'
import { stateOf } from '@/lib/brand/provenance'
import { activeThemeTokens } from '@/lib/brand/read-theme'

/**
 * TURNING A BRAND BRAIN INTO SIGNALS A PICTURE CAN BE CONDITIONED ON.
 *
 * ── ONLY THE FIELDS THAT AFFECT AN IMAGE ────────────────────────────────────
 * The brain has six sections and most of them are about WORDS: banned phrases,
 * signature phrases, sample hooks, red lines. Feeding those to an image model
 * does nothing useful and costs prompt room, so this picks the four leaves that
 * change what a picture LOOKS like, plus the palette.
 *
 * Choosing a subset is a product decision, not an optimisation, and it is made
 * here in one place so the screen and the model can never disagree about what
 * conditioned an image.
 *
 * ── EACH LEAF CARRIES ITS OWN CERTAINTY, READ FROM THE BRAIN ────────────────
 * `stateOf(provenance, path)` answers `confirmed` or `guessed` per dotted leaf,
 * and a MISSING entry is `guessed` rather than unknown. Nothing here upgrades a
 * certainty and nothing invents a third state.
 *
 * ── THE PALETTE IS THE HONEST EXCEPTION, AND IT IS WORTH READING TWICE ──────
 * Colour is NOT in the brain. It lives in `workspace_themes`, whose certainty is
 * a ROW-level `source` of 'default' | 'extracted' | 'manual' with no per-token
 * provenance at all. So:
 *
 * MEASURED: the reader available here, `activeThemeTokens`, returns
 * RESOLVED tokens and does not carry that source at all. So colour is always
 * reported as a guess, never as confirmed, because the certainty simply is not
 * knowable from here and claiming it would be the exact defect this file exists
 * to prevent. A workspace with no theme row contributes no colour signal.
 *
 * ── AND NOTHING IS INVENTED ─────────────────────────────────────────────────
 * A brain that cannot be read yields an EMPTY list, not a partial one built from
 * guesses. The caller's copy distinguishes "no brand to work from" from "brand
 * used", so an empty list is a true answer rather than a silent degradation.
 */

/** The leaves that change what a picture looks like, and how to say each one. */
const VISUAL_LEAVES: readonly { path: string; field: string; read: (b: Brain) => string }[] = [
  {
    path: 'voice.descriptor',
    field: 'voice',
    read: (b) => b.voice.descriptor,
  },
  {
    path: 'brand_persona.archetype',
    field: 'character',
    read: (b) => b.brand_persona.archetype,
  },
  {
    path: 'brand_persona.one_liner',
    field: 'what the business is',
    read: (b) => b.brand_persona.one_liner,
  },
  {
    path: 'hook.primary_emotion',
    field: 'feeling',
    read: (b) => b.hook.primary_emotion,
  },
]

type Brain = {
  voice: { descriptor: string }
  brand_persona: { archetype: string; one_liner: string }
  hook: { primary_emotion: string }
}

/**
 * The brand facts that should condition an image in this workspace.
 *
 * Never throws. A brain that will not read and a palette that will not read are
 * both "nothing to add", because failing a generation over a brand fact would
 * refuse a picture a person can perfectly well have without one.
 */
export async function brandSignalsFor(workspaceId: string): Promise<BrandSignal[]> {
  const signals: BrandSignal[] = []

  try {
    const brain = await readBrain()
    if (brain.status === 'ok') {
      for (const leaf of VISUAL_LEAVES) {
        const value = leaf.read(brain.active as unknown as Brain)
        if (typeof value !== 'string' || value.trim() === '') continue
        signals.push({
          field: leaf.field,
          certainty: stateOf(brain.provenance, leaf.path) === 'confirmed' ? 'confirmed' : 'guessed',
          value: value.trim(),
        })
      }
    }
  } catch {
    // An unreadable brain is an unconditioned image, which is a worse picture
    // and not a failure. The screen says which happened.
  }

  try {
    const tokens = await activeThemeTokens(workspaceId)
    const palette = paletteSignal(tokens)
    if (palette !== null) signals.push(palette)
  } catch {
    // Same reasoning as the brain.
  }

  return signals
}

/**
 * The palette as one signal, or nothing.
 *
 * ── IT IS ALWAYS A GUESS, AND THAT IS A MEASUREMENT NOT A CHOICE ────────────
 * `activeThemeTokens` returns a resolved `ThemeTokens` (primary, secondary,
 * accent, and the rest) and DOES NOT carry the row's `source`. So from here it
 * is impossible to tell colours the owner chose from colours Sahoda pulled out
 * of their logo. Marking them `confirmed` would claim a certainty the reader
 * cannot support, so this never returns `confirmed` for colour at all.
 *
 * When per-token provenance arrives on `workspace_themes`, this is the one
 * function that changes.
 *
 * A null theme is no palette, and no palette is nothing to say. It is not the
 * default palette dressed up as a brand fact: Sahoda's defaults are Sahoda's,
 * and sending them would paint every workspace the same colours while the
 * screen reported that the brand had conditioned the picture.
 */
export function paletteSignal(tokens: ThemeLike | null): BrandSignal | null {
  if (tokens === null) return null

  const colors = [tokens.primary, tokens.secondary, tokens.accent]
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map((c) => c.trim())
  if (colors.length === 0) return null

  return { field: 'colours', certainty: 'guessed', value: colors.slice(0, 5).join(', ') }
}

/** Just the three colours this module reads, so a token set can be handed in whole. */
export type ThemeLike = {
  primary?: string | null
  secondary?: string | null
  accent?: string | null
}
