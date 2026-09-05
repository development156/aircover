import 'server-only'

import type { BrandSignal } from '@sahoda/shared'

import type { BrainRead } from '@/lib/brand/read-brain'
import { readBrain } from '@/lib/brand/read-brain'
import { stateOf } from '@/lib/brand/provenance'
import { activeThemeTokens } from '@/lib/brand/read-theme'

import { paletteSignal, type ThemeLike } from './brand-signals'

/**
 * THE ENGINE SIDE OF "REFINE MY PROMPT" — three honest states, never two.
 *
 * ── WHY THIS IS ITS OWN FILE, AND NOT AN EDIT TO `brand-signals.ts` ─────────
 * `brandSignalsFor` (this directory) is built for image CONDITIONING, where
 * "the brain could not be read" and "the brain is empty" are deliberately the
 * same outcome — an unconditioned picture either way, and the screen never had
 * to say which. This feature is different: `apps/web/src/lib/studio/prompt.ts`'s
 * own house rule is "honest when the Brand Brain is empty or unreadable — three
 * states, never two", so the collapse `brandSignalsFor` makes on purpose is
 * exactly the thing this file must not do. Rather than change what
 * `brandSignalsFor` promises its existing caller, this is a parallel reader
 * that keeps `readBrain()`'s own four-way status alive instead of swallowing it.
 *
 * The visual leaves read are the SAME four `brandSignalsFor` reads (plus the
 * palette, via its own exported `paletteSignal`) — refining an image prompt and
 * conditioning the image itself should never be able to disagree about what
 * the brand holds, so the vocabulary is shared even though the honesty
 * bookkeeping is not.
 */

export type BrainState = 'empty' | 'unreadable' | 'ok'

export interface RefineContext {
  brainState: BrainState
  /** Empty for BOTH `empty` and `unreadable` — see `promptRefineTask`'s header for why that is correct at the model boundary. */
  signals: BrandSignal[]
}

type Brain = {
  voice: { descriptor: string }
  brand_persona: { archetype: string; one_liner: string }
  hook: { primary_emotion: string }
}

const VISUAL_LEAVES: readonly { path: string; field: string; read: (b: Brain) => string }[] = [
  { path: 'voice.descriptor', field: 'voice', read: (b) => b.voice.descriptor },
  { path: 'brand_persona.archetype', field: 'character', read: (b) => b.brand_persona.archetype },
  {
    path: 'brand_persona.one_liner',
    field: 'what the business is',
    read: (b) => b.brand_persona.one_liner,
  },
  { path: 'hook.primary_emotion', field: 'feeling', read: (b) => b.hook.primary_emotion },
]

/**
 * PURE: turn an already-resolved brain read into a refine context.
 *
 * No I/O here — this is the part a test can call directly, without a Supabase
 * client or a workspace. `resolveRefineContext` below is the thin async
 * wrapper that supplies the real read.
 */
export function refineContextFromBrainRead(
  read: BrainRead,
  theme?: ThemeLike | null,
): RefineContext {
  // `no-workspace` at this point in the product means the caller already knows
  // a real workspace exists (it resolved one to get here) and `readBrain()`
  // disagreed. That is a contradiction, not "nothing to know" — the honest
  // branch is the same one an outright read failure takes.
  if (read.status === 'unreadable' || read.status === 'no-workspace') {
    return { brainState: 'unreadable', signals: [] }
  }
  if (read.status === 'no-brain') {
    return { brainState: 'empty', signals: [] }
  }

  const signals: BrandSignal[] = []
  const brain = read.active as unknown as Brain
  for (const leaf of VISUAL_LEAVES) {
    const value = leaf.read(brain)
    if (typeof value !== 'string' || value.trim() === '') continue
    signals.push({
      field: leaf.field,
      certainty: stateOf(read.provenance, leaf.path) === 'confirmed' ? 'confirmed' : 'guessed',
      value: value.trim(),
    })
  }
  if (theme) {
    const palette = paletteSignal(theme)
    if (palette !== null) signals.push(palette)
  }

  return { brainState: 'ok', signals }
}

/**
 * The real read, for a server action. Never throws: a theme read failure
 * degrades to no palette signal rather than to "unreadable" — the brain and the
 * theme are two different tables and one's outage must not be reported as the
 * other's.
 */
export async function resolveRefineContext(workspaceId: string): Promise<RefineContext> {
  const read = await readBrain()
  let theme: ThemeLike | null = null
  try {
    theme = await activeThemeTokens(workspaceId)
  } catch {
    /* no palette signal; the brain's own status is unaffected */
  }
  return refineContextFromBrainRead(read, theme)
}

/**
 * WHAT TO TELL SOMEBODY, BEFORE THEY ACCEPT A REFINED PROMPT.
 *
 * Three sentences and each states a different claim — the same discipline
 * `describeConditioning` (`./prompt.ts`) uses for image conditioning, kept as
 * its own function because the claims here are about a TEXT refinement rather
 * than a picture, and because "unreadable" is a claim `describeConditioning`
 * never has to make (image conditioning is allowed to collapse it).
 */
export function describeRefineContext(ctx: RefineContext): { headline: string; body: string } {
  if (ctx.brainState === 'unreadable') {
    return {
      headline: 'Sahoda could not read your Brand Brain this time',
      body: 'This refinement is built from your own words alone, not a reading of your brand. Nothing was invented to fill the gap. Try again in a moment.',
    }
  }
  if (ctx.brainState === 'empty') {
    return {
      headline: 'Sahoda has nothing about your brand to work from yet',
      body: 'This refinement is built from your own words alone. Filling in your Brand Brain lets Sahoda ground the next one in it.',
    }
  }
  if (ctx.signals.length === 0) {
    return {
      headline: 'Built from your words alone',
      body: 'Sahoda read your Brand Brain and found nothing in it that changes an image prompt.',
    }
  }
  const confirmed = ctx.signals.filter((s) => s.certainty === 'confirmed').length
  const guessed = ctx.signals.length - confirmed
  if (guessed === 0) {
    return {
      headline: `Built with ${confirmed} confirmed thing${confirmed === 1 ? '' : 's'} about your brand`,
      body: 'Your own words stay first; these are folded in around them.',
    }
  }
  if (confirmed === 0) {
    return {
      headline: `Built with ${guessed} thing${guessed === 1 ? '' : 's'} Sahoda worked out about your brand`,
      body: 'Confirming them in your Brand Brain makes the next refinement more certain.',
    }
  }
  return {
    headline: `Built with ${confirmed} confirmed and ${guessed} guessed thing${guessed === 1 ? '' : 's'} about your brand`,
    body: 'Confirming the guesses in your Brand Brain makes the next refinement more certain.',
  }
}
