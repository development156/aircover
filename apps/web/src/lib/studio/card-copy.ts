import { countCertainty, type BrandSignal, type GenerationStatus } from '@sahoda/shared'

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
