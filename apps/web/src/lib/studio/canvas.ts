import type { GenerationMode, StampOutcome } from '@sahoda/shared'

import type { GenerationCard, GenerationPicture } from './read'

/**
 * WHAT THE CANVAS SHOWS, AND WHAT A SAVED FILE IS CALLED.
 *
 * ── THE CANVAS IS THE PRODUCT, THE LIST IS THE RECEIPT ──────────────────────
 * Somebody spends credits and then has to decide whether to use what came back.
 * That decision needs the picture large, at its real shape, with the ones before
 * it a click away. A grid of thumbnails is a record of what was bought; it is
 * not the thing that lets somebody judge a photograph.
 *
 * ── ONLY PICTURES THAT EXIST REACH IT ───────────────────────────────────────
 * A generation that failed, one still running, one whose file was deleted from
 * the library, and one whose preview link would not sign are four different
 * situations. None of them is a picture that can be shown, so none of them
 * belongs on the canvas. They are all still visible in the list below, which is
 * where the record of what happened lives.
 *
 * Pure: no I/O, no clock, no database.
 */

/** One picture the canvas can actually draw, with what it was asked for. */
export type CanvasPicture = {
  imageId: string
  /**
   * Never null here, and that is a consequence rather than an assertion: a
   * picture only reaches the canvas when it has a signed link, and the reader
   * only produces a link for a row whose file still exists. A picture deleted
   * from the library has no link, so it never gets in.
   */
  assetId: string
  /** Never null here. A picture with no link cannot be shown, so it never gets in. */
  url: string
  width: number | null
  height: number | null
  /** What the person typed, for the alt text and the caption. */
  prompt: string
  formatId: string | null
  mime: string | null
  /**
   * Everything needed to ask for this picture AGAIN, carried on the picture
   * itself. The fastest useful action after a result you almost like is the same
   * request with one word changed, and today that means retyping the sentence
   * and re-picking the references.
   */
  mode: GenerationMode
  referenceAssetIds: string[]
  /**
   * The logo-stamped copy's link, when one exists and signed. The picture keeps
   * BOTH versions: `url` is always the model's own output, untouched, and this
   * is the additional one. Nothing here ever replaces `url` — a screen that
   * swapped them would make the unstamped picture unreachable, which is the
   * thing `stamped_asset_id` exists to prevent.
   */
  stampedUrl: string | null
  /**
   * WHY this picture does or does not carry the logo. Null means stamping was
   * never attempted; `lib/studio/stamp-copy.ts` turns each answer into the one
   * sentence that is true for it, and refuses to share sentences between them.
   */
  stampOutcome: StampOutcome | null
}

/**
 * The showable pictures, newest first, flattened out of the generation cards.
 *
 * Order comes from the cards, which the reader already sorted newest first, so
 * the first entry is the most recent thing this workspace made. That matters
 * more than it looks: after a generation the screen refreshes and the canvas
 * shows position zero, which is the picture that was just paid for. No effect,
 * no id to track, no chance of showing yesterday's.
 */
export function canvasPictures(cards: readonly GenerationCard[]): CanvasPicture[] {
  const out: CanvasPicture[] = []
  for (const card of cards) {
    if (card.generation.status !== 'ready') continue
    for (const picture of card.pictures) {
      // Both, not one: the link is what the canvas draws and the id is what a
      // post attaches. The reader ties them together, and checking both here is
      // what lets `assetId` be a string rather than a cast.
      if (picture.url === null || picture.assetId === null) continue
      out.push({
        imageId: picture.imageId,
        assetId: picture.assetId,
        url: picture.url,
        width: picture.width,
        height: picture.height,
        prompt: card.generation.prompt_given,
        formatId: card.generation.format_id,
        mime: picture.mime,
        mode: card.generation.mode,
        referenceAssetIds: [...card.generation.reference_asset_ids],
        stampedUrl: picture.stampedUrl,
        stampOutcome: picture.stampOutcome,
      })
    }
  }
  return out
}

/** True when this picture is one the canvas can draw. Narrowed, not asserted. */
export function isShowable(
  picture: GenerationPicture,
): picture is GenerationPicture & { url: string } {
  return picture.url !== null
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * What a downloaded picture is called on somebody's computer.
 *
 * ── WHY THE PROMPT IS IN THE NAME ───────────────────────────────────────────
 * A folder of `download.png`, `download (1).png`, `download (2).png` is a folder
 * nobody can use. The words a person typed are the only thing that tells them,
 * a week later, which file is which, so those words are the filename.
 *
 * ── AND WHY THE ID IS ALSO IN IT ────────────────────────────────────────────
 * Two presses of the same prompt make two different pictures. Without something
 * unique the second silently overwrites the first, or the browser renames it to
 * something meaningless. Eight characters of the picture's own id is enough to
 * keep them apart and short enough to still read the prompt.
 *
 * The extension comes from the mime we PROVED by sniffing the bytes, never from
 * the model's claim about them. When we have no proof, the name carries no
 * extension rather than a wrong one: an operating system can work out a file it
 * was handed unnamed, and cannot recover from being told a JPEG is a PNG.
 */
export function downloadName(picture: {
  imageId: string
  prompt: string
  mime: string | null
}): string {
  const words = picture.prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')

  const stem = words === '' ? 'picture' : words
  const unique = picture.imageId.replace(/-/g, '').slice(0, 8)
  const extension = picture.mime === null ? null : (EXTENSIONS[picture.mime] ?? null)

  return extension === null ? `${stem}-${unique}` : `${stem}-${unique}.${extension}`
}
