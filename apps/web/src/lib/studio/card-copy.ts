import { countCertainty, type BrandSignal, type GenerationStatus } from '@sahoda/shared'

import { formatById } from './formats'

/**
 * WHAT A GENERATION'S CARD SAYS ABOUT ITSELF.
 *
 * Pulled out of the component because every sentence here is a CLAIM about
 * somebody's money or their brand, and a claim belongs somewhere it can be
 * tested. Pure: no I/O, no clock, no database.
 */

/**
 * Where it got to, in a shop owner's words.
 *
 * `failed` says nothing was charged, and that is the load-bearing half: the fear
 * at that moment is having paid for a picture that never arrived. The hold was
 * released, so it is also true.
 */
export function describeStatus(status: GenerationStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready, and saved to your library'
    case 'failed':
      return 'This one did not work, and nothing was charged'
    case 'cancelled':
      return 'Stopped before it was made, and nothing was charged'
    case 'running':
      return 'Being drawn now'
    case 'queued':
      return 'Waiting to start'
  }
}

/**
 * What the picture was built from.
 *
 * ── NULL AND EMPTY ARE DIFFERENT ANSWERS ────────────────────────────────────
 * `null` means conditioning never ran, which is what a row that failed early
 * looks like. An EMPTY ARRAY means it ran and deliberately used nothing, which
 * is exactly right for Explore. A screen that rendered both as "no brand
 * signals" would tell an Explore user their Brand Brain was broken.
 */
export function describeBuiltFrom(signals: readonly BrandSignal[] | null): string {
  if (signals === null) return 'Built from your words alone.'
  if (signals.length === 0) return 'Built from your words alone, on purpose.'

  const { confirmed, inferred: guessed } = countCertainty(signals)
  const thing = (n: number) => `${n} thing${n === 1 ? '' : 's'}`

  if (guessed === 0) return `Built from ${thing(confirmed)} you have confirmed about your brand.`
  if (confirmed === 0) {
    return `Built from ${thing(guessed)} Sahoda worked out about your brand.`
  }
  return `Built from ${confirmed} confirmed and ${guessed} guessed thing${
    guessed === 1 ? '' : 's'
  } about your brand.`
}

/**
 * What to say where a picture would be.
 *
 * Four states and each is a different fact. The one that matters is the third:
 * the file was deleted from the library, which is a thing the person did and a
 * true thing to report, not an error.
 */
export function describePicture(input: {
  status: GenerationStatus
  hasAsset: boolean
  hasUrl: boolean
}): string | null {
  if (input.hasUrl) return null
  if (input.status === 'failed' || input.status === 'cancelled') return null
  if (!input.hasAsset) return 'This picture was deleted from your library.'
  return 'The picture is in your library. Its preview could not be loaded just now.'
}

/**
 * How many pictures arrived, when it was not how many were asked for.
 *
 * ── SILENT WHEN ONLY ONE WAS ASKED FOR ──────────────────────────────────────
 * "1 option" on every ordinary card is arithmetic nobody needed, and a card that
 * announces its own arithmetic teaches people to stop reading cards, which costs
 * the sentences that matter. Four of four DOES speak, because the card holds
 * four pictures and saying so is what makes the extra thumbnails legible.
 *
 * ── AND THE ROW IS WHERE THIS COMES FROM ────────────────────────────────────
 * `requested_count` against the pictures actually beneath the row, never a
 * figure the screen worked out for itself. A count no query produced is exactly
 * the kind of number this product refuses to render.
 */
export function describeCount(input: { made: number; asked: number }): string | null {
  if (input.asked <= 1) return null
  if (input.made >= input.asked) {
    return `${input.asked} options, and you can use any of them.`
  }
  return `${input.made} of the ${input.asked} options you asked for arrived. You were charged for those and for nothing else.`
}

/**
 * The size a picture was made at, in words a shop owner reads.
 *
 * ── THE ROW HOLDS A KEY, NOT A LABEL ────────────────────────────────────────
 * `format_id` is `link-card`, `business-update`, `on_brand`. Printing it puts an
 * internal identifier on a customer's screen, which is the same defect as
 * leaking a column name: it is not wrong, it is simply not addressed to them.
 *
 * ── AND A PRESET WE NO LONGER OFFER IS NOT AN ERROR ─────────────────────────
 * Old rows outlive the list of sizes. A picture made at a size since retired is
 * still a real picture, so this returns null and the card says nothing about
 * size rather than printing a key nobody can look up.
 */
export function describeFormat(formatId: string | null): string | null {
  if (formatId === null) return null
  const format = formatById(formatId)
  if (format === null) return null
  return `${format.label}, ${format.width} by ${format.height}`
}

/**
 * How long a picture may sit unfinished before the screen stops claiming it is
 * being drawn.
 *
 * MEASURED: the provider call is seconds, and the whole request is written,
 * sent, stored and settled inside one server action. Ten minutes is far beyond
 * any real generation and well short of somebody's patience, so a row past it
 * is not slow, it is stranded.
 */
export const STRANDED_AFTER_MS = 10 * 60 * 1000

/**
 * What to say about a picture that never finished.
 *
 * ── THE ROW THAT SAYS "BEING DRAWN NOW" FOREVER ─────────────────────────────
 * The row is written BEFORE the model is called, deliberately, so that pressing
 * Back does not lose the request. The cost of that is a row left at `running`
 * when the process serving it died: nothing settles it, and the card goes on
 * telling somebody their picture is being drawn, for as long as they keep the
 * account.
 *
 * ── AND THE SENTENCE MUST NOT GUESS AT THE MONEY ────────────────────────────
 * We do not know from the row alone whether the hold was released, so this says
 * what IS known: no picture arrived, and the wallet is where the answer is. A
 * card that promised "nothing was charged" would be a claim this data cannot
 * support, and one that stayed silent would leave somebody watching a spinner
 * that will never stop.
 *
 * Returns null for anything that is not a stranded row, including a settled one
 * and a young one, so an ordinary generation says nothing extra.
 */
export function describeStranded(input: {
  status: GenerationStatus
  /** When the model call began. Null for a row that never got that far. */
  startedAt: string | null
  createdAt: string
  now: number
}): string | null {
  if (input.status !== 'running' && input.status !== 'queued') return null

  const began = Date.parse(input.startedAt ?? input.createdAt)
  // An unparseable timestamp is not evidence of anything. Saying nothing is the
  // honest answer; calling it stranded on a date we could not read would age
  // out live generations at random.
  if (Number.isNaN(began)) return null
  if (input.now - began < STRANDED_AFTER_MS) return null

  return 'This one stopped before it finished, and no picture arrived. Your wallet shows whether it was charged.'
}
