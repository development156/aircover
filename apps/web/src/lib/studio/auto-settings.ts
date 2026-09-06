import type { Channel } from '@sahoda/shared'

import { formatsForChannel, type StudioFormat } from './formats'
import { defaultModelId } from './models'

/**
 * THE SETTINGS THE STUDIO WOULD PICK FOR A POST, WITHOUT ANYBODY AT THE SCREEN.
 *
 * "Plan my week with pictures" makes one picture per drafted post, and nobody
 * is there to choose a shape, a mode or a model. This module decides, from the
 * post alone, and every choice is a rule the Studio's own screen already
 * applies, never a new one:
 *
 * - The SHAPE is the first size every one of the post's channels accepts,
 *   asked through `formatsForChannel`, which is what the picker offers. A post
 *   for Instagram and X gets the square both take; one for Instagram alone gets
 *   the portrait Instagram prefers, because that is the first size the picker
 *   lists for it. When the channels share no size at all, the first channel's
 *   first size wins and the others crop at attach time, which the composer's
 *   attach gate already handles and says.
 * - The MODE is `on_brand`: a picture for a post that will be published, not an
 *   exploration.
 * - The MODEL is the everyday routed one, the same default the screen opens on.
 * - The PROMPT is the post's own words, title first, trimmed to the same bound
 *   the screen enforces. A post with no words gets nothing: the caller must not
 *   spend on a picture of nothing in particular.
 *
 * Pure: no I/O, no clock, so every branch is a unit test.
 */

/** The Studio's own ceiling for what a person may type (`GenerateInputSchema.wanted`). */
const WANTED_MAX = 1000
const WANTED_MIN = 3

/** Shown to the person beside the picture, so they can see what was decided. */
export interface AutoSettings {
  mode: 'on_brand'
  formatId: string
  /** "1080 × 1350 · Portrait", for the reveal card. */
  formatLabel: string
  modelId: string
  wanted: string
}

export type AutoSettingsResult =
  { ok: true; settings: AutoSettings } | { ok: false; reason: 'no_words' | 'no_format' }

/** The first size every channel accepts, else the first channel's first size, else null. */
export function chooseFormat(channels: readonly Channel[]): StudioFormat | null {
  const lists = channels.map((channel) => formatsForChannel(channel)).filter((l) => l.length > 0)
  if (lists.length === 0) return null
  const [first, ...rest] = lists
  const shared = first!.find((format) => rest.every((list) => list.some((f) => f.id === format.id)))
  return shared ?? first![0] ?? null
}

/**
 * The picture's brief, from the post's words. The title leads because it is
 * the one line a person wrote to say what the post is; the body follows for
 * detail. Whitespace collapsed, and cut on a word so the model is not handed
 * half of one.
 */
export function promptFor(input: { title: string | null; body: string | null }): string | null {
  const parts = [input.title, input.body]
    .map((part) => (part ?? '').replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
  if (parts.length === 0) return null
  const joined = parts.join('. ')
  if (joined.length < WANTED_MIN) return null
  if (joined.length <= WANTED_MAX) return joined
  const cut = joined.slice(0, WANTED_MAX)
  const atWord = cut.lastIndexOf(' ')
  return (atWord > WANTED_MAX / 2 ? cut.slice(0, atWord) : cut).trim()
}

export function chooseSettings(post: {
  title: string | null
  body: string | null
  channels: readonly Channel[]
}): AutoSettingsResult {
  const wanted = promptFor(post)
  if (wanted === null) return { ok: false, reason: 'no_words' }
  const format = chooseFormat(post.channels)
  if (format === null) return { ok: false, reason: 'no_format' }
  return {
    ok: true,
    settings: {
      mode: 'on_brand',
      formatId: format.id,
      formatLabel: `${format.width} × ${format.height} · ${format.label}`,
      modelId: defaultModelId(),
      wanted,
    },
  }
}
