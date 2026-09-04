import type { MediaTarget } from './targets'
import { outputMimeFor } from './crop-offer'

/**
 * When is a photo publishable after nothing but a CHANGE OF CONTAINER?
 *
 * ── THE CASE THIS EXISTS FOR ─────────────────────────────────────────────────
 * A shop owner attaches a perfectly good WebP to a post going to Instagram.
 * Instagram's spec lists jpeg and png and nothing else, so the Constraint Engine
 * refuses it with MEDIA_TYPE — correctly — and the person is asked to go and
 * convert a file themselves, using a tool we already ship. `sharp` is a
 * dependency, `derive.ts` re-encodes with a quality ladder, and `outputMimeFor`
 * already works out the one container that suits every channel a post targets.
 * All that was missing was the decision to do it without asking.
 *
 * ── WHY THIS IS SEPARATE FROM THE CROP OFFER ─────────────────────────────────
 * A crop CHANGES THE PICTURE. Which part of a photo survives a 9:16 story is a
 * judgement only the owner can make, which is why `offer.ts` composes a proposal
 * and writes nothing until they accept. Re-encoding the same pixels into another
 * container changes nothing anyone can see, so asking is a question with one
 * sensible answer — and a question with one sensible answer is a chore, not a
 * choice. Only the transcode is automatic; a crop still needs a person.
 *
 * ── WHAT IS DELIBERATELY NOT DONE ────────────────────────────────────────────
 * The ORIGINAL is never touched. This plans a derivative, exactly as a crop does,
 * because the library holds what the customer gave us. And nothing here reaches
 * for AVIF: no channel's spec lists it, `sniffImage` cannot identify it, and the
 * publish job re-hosts stored bytes with no encoder of its own — so an efficient
 * container at rest would be an unpublishable one at send time.
 *
 * Pure module. No bytes, no I/O, no writes. It decides; `mint.ts` acts.
 */

export type AutoConvertPlan =
  /** Re-encode into `mime`, same pixels, no crop. Safe to do without asking. */
  | { kind: 'transcode'; mime: string }
  /** Already fine for every channel this post targets. */
  | { kind: 'none' }
  /**
   * A container change alone cannot fix it. Either the geometry is wrong too — a
   * crop, which is the customer's call — or no single container suits every
   * channel, which is a refusal and not something to paper over.
   */
  | { kind: 'refuse'; reason: 'needs_crop' | 'no_common_container' }

export interface AutoConvertInput {
  /** What the bytes PROVED, never what the file claimed. */
  originalMime: string
  /** The channels this post is going to, with the mimes each accepts. */
  targets: readonly MediaTarget[]
  /**
   * True when something other than the container is also wrong — a dimension
   * floor, an aspect band, a byte ceiling. Supplied by the caller from
   * `decideAttach`'s own rejection codes rather than recomputed here, so this
   * module cannot drift from the engine that produced them.
   */
  hasNonFormatObjection: boolean
}

export function planAutoConvert(input: AutoConvertInput): AutoConvertPlan {
  // Geometry first. A file that also needs cropping is the crop offer's business,
  // and silently transcoding it would produce a file that is still refused — the
  // worst outcome, because the work happened and the refusal did not change.
  if (input.hasNonFormatObjection) return { kind: 'refuse', reason: 'needs_crop' }

  const target = outputMimeFor(input.originalMime, input.targets)
  if (target === null) return { kind: 'refuse', reason: 'no_common_container' }
  if (target === input.originalMime) return { kind: 'none' }

  return { kind: 'transcode', mime: target }
}

/**
 * What the composer says once a conversion has happened.
 *
 * Said, never hidden. A file that arrives as one format and publishes as another
 * is a fact about the customer's own picture, and finding out later — from a
 * platform, or from a download — is worse than being told now. It is one calm
 * line, not a warning: nothing went wrong and nothing needs doing.
 */
export function autoConvertNote(fromMime: string, toMime: string): string {
  return `Saved a ${label(toMime)} copy for this post, because ${label(fromMime)} is not accepted on every channel you picked. Your original is untouched in the library.`
}

function label(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'JPEG'
    case 'image/png':
      return 'PNG'
    case 'image/webp':
      return 'WebP'
    case 'image/gif':
      return 'GIF'
    default:
      return mime
  }
}
