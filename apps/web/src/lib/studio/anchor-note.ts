import type { StampAnchor, StampAnchorMoveReason } from '@sahoda/shared'

/**
 * FOUR THINGS THE PLACEMENT CAN SAY, AND WHEN IT SAYS NOTHING AT ALL.
 *
 * ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
 * The renderer measures all four corners of the finished picture and may move
 * the mark off the corner the customer chose: to a quieter one, or to one where
 * the mark stays legible. `corner-choice.ts` decides it and `stamp.ts` carries
 * the fact out on `AnchorChoice`, but until this the fact reached no screen. So
 * a control that said "bottom-right" could silently produce a picture stamped
 * top-left, with the logo visibly in a corner nobody chose and no word about it
 * anywhere. That is exactly the silent-override defect this product forbids.
 *
 * Same shape as `stamp-copy.ts` and `lib/inbox/emptiness.ts`: the tests assert
 * the CLAIM, never the wording, so every sentence below can be rewritten freely
 * and the guarantees survive.
 *
 * ── FOUR ANSWERS, AND ONLY TWO OF THEM ARE A SENTENCE ───────────────────────
 * The two that read `moved: false` are the SILENT cases, kept apart because they
 * are different facts even though neither prints:
 *
 *   unrecorded  the anchor was never written for this picture: a row drawn
 *               before this shipped, a deploy where the column is not applied,
 *               or a picture that carries no mark at all. NOT the same as
 *               "stamped where asked", and never guessed into one.
 *   as_chosen   the mark went in the corner the customer chose. Silence is the
 *               correct answer: congratulating somebody for their setting
 *               working is noise, and a sentence here would train them to ignore
 *               the one that matters.
 *
 * The two that read `moved: true` each carry the sentence and the corner the
 * mark actually landed in:
 *
 *   busy        the chosen corner was too busy behind the mark.
 *   unreadable  the mark would not have been legible in the chosen corner.
 *
 * ── WHY IT TAKES ONLY THE STORED PAIR ───────────────────────────────────────
 * `stamped_anchor` is where the mark landed; `stamp_anchor_moved_reason` is why,
 * when it differs from the corner asked for. That pair is everything a reader
 * needs: the destination corner to name, and the reason it moved there. The
 * corner they CHOSE is their own setting and is referred to as such rather than
 * named, so this function never needs it and cannot disagree with it.
 *
 * Pure: no I/O, no clock, no database, no React.
 */

/**
 * The stored key IS the readable form here, so there is no lookup table.
 *
 * This was a `Record<StampAnchor, string>` mapping each key to itself, under a
 * comment promising "words a shop owner reads, never the stored key". It
 * returned the stored key. An identity map that claims to translate is worse
 * than no map: it reads as a solved problem and hides that nobody checked.
 *
 * Nothing needs translating, because these four keys are already ordinary
 * English in the one position they are used: "the top-left corner". The hyphen
 * is a compound modifier before a noun and is correct typography, not a
 * leaked identifier. `bottom_right` with an underscore WOULD need converting,
 * which is what the original comment was guarding against, and no such
 * spelling exists in this vocabulary. If one is ever added, this is where the
 * conversion belongs.
 */

export type AnchorNote =
  | {
      /** No sentence. `reason` says which of the two silent cases this is. */
      moved: false
      reason: 'unrecorded' | 'as_chosen'
    }
  | {
      moved: true
      reason: StampAnchorMoveReason
      /** The corner the mark actually landed in. */
      corner: StampAnchor
      /** One sentence, true of THIS move alone. Name the corner in words. */
      body: string
    }

/**
 * Turn the stored pair into what the customer reads, or into silence.
 *
 * The order of the branches is the order of certainty: a picture with no
 * recorded anchor said nothing (`unrecorded`) BEFORE a picture whose reason is
 * null said nothing (`as_chosen`), because the two are different facts and a
 * screen that shares one between them makes a claim it cannot support.
 */
export function anchorNote(input: {
  anchor: StampAnchor | null
  reason: StampAnchorMoveReason | null
}): AnchorNote {
  // Nothing was recorded. Every row before this shipped, and every deploy where
  // the column is not applied, lands here, and it must never be read as "stamped
  // where asked": that would state a placement nobody measured.
  if (input.anchor === null) {
    return { moved: false, reason: 'unrecorded' }
  }

  // The mark went where it was asked to. Silence, deliberately.
  if (input.reason === null) {
    return { moved: false, reason: 'as_chosen' }
  }

  const corner = input.anchor
  if (input.reason === 'busy') {
    return {
      moved: true,
      reason: 'busy',
      corner: input.anchor,
      body: `Moved the logo to the ${corner} corner, which had more room. The corner you chose was too busy behind the mark.`,
    }
  }

  return {
    moved: true,
    reason: 'unreadable',
    corner: input.anchor,
    body: `Moved the logo to the ${corner} corner, where it stays legible. The mark would have been hard to read in the corner you chose.`,
  }
}
