import type { StampOutcome } from '@sahoda/shared'

/**
 * FIVE ANSWERS TO "WHY DOES THIS PICTURE LOOK LIKE THIS", AND NO SHARED SENTENCE.
 *
 * ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
 * `studio_generation_images.stamped_asset_id` is a pointer, so its NULL is one
 * fact — no stamped copy — standing in for four different situations. The
 * migration that added it says in its own step 5 that the copy must never
 * collapse them, and for one day it left the screen no way not to: nothing
 * recorded WHY. `stamp_outcome` records it, and this module is where a recorded
 * reason becomes the one sentence that is true for it.
 *
 * Same shape as `lib/inbox/emptiness.ts`, which keeps eight kinds of nothing
 * apart for the same reason: "we never asked" and "we asked and got nothing"
 * are different sentences, and a screen that shares one between them tells
 * somebody a thing that is not true about their own account.
 *
 * ── WHAT EACH ANSWER MAY AND MAY NOT CLAIM ─────────────────────────────────
 * The tests assert the CLAIM, never the wording, so these sentences can be
 * rewritten freely and the guarantees survive:
 *
 *   stamped          a stamped copy exists, and BOTH versions are kept
 *   no_logo          nothing to stamp yet · remedy: add a logo · must NOT
 *                    suggest replacing one, and must not say anything failed
 *   logo_unreadable  a logo EXISTS and could not be read · remedy: replace the
 *                    file · must NOT tell somebody to add a logo they added
 *   failed           stamping ran and produced nothing · the picture is theirs
 *                    and they were charged once · offers NO remedy, because
 *                    there is none the reader owns
 *   skipped          the CUSTOMER turned it off for this press · their choice,
 *                    stated back to them · must NOT read as a failure and must
 *                    NOT claim the picture predates the feature
 *   null             never attempted BY US · nothing went wrong · must NOT read
 *                    as a failure, and must not offer a remedy for one
 *
 * ── AND WHY THERE IS NO SIXTH ──────────────────────────────────────────────
 * `failed` covers a mark that would not fit, bytes that would not encode and an
 * upload that did not land. They are one value here because they are one
 * sentence to a reader: no action of theirs changes any of them. Splitting a
 * code a person cannot act on would invent a distinction no screen can honour,
 * which is the opposite failure from the one this file exists for and just as
 * dishonest.
 *
 * Pure: no I/O, no clock, no database.
 */

/** What the screen renders. `remedy` is null when there is nothing to offer. */
export type StampNote = {
  /** A short label. Never a sentence, never punctuated. */
  title: string
  /** One sentence of body. Always true of THIS outcome alone. */
  body: string
  /**
   * The one thing the reader can do about it, or null.
   *
   * Null is not "we could not think of one": it is the assertion that no action
   * of theirs would change this, and `no-impossible-remedy.spec.ts` exists
   * because offering a route that leads nowhere is worse than offering none.
   */
  remedy: { label: string; href: '/brain' } | null
  /**
   * Whether the screen may offer a choice between two versions. True only for
   * `stamped` — every other answer has exactly one picture, and a toggle over
   * one picture is a control that does nothing.
   */
  hasBothVersions: boolean
}

// Typed as the literal route rather than `string`: Next's typed routes refuse a
// widened string, and there is exactly one destination today. A second one
// widens this union deliberately rather than by accident.
const BRAND_BRAIN = { label: 'Add your logo', href: '/brain' } as const
const REPLACE_LOGO = { label: 'Replace your logo', href: '/brain' } as const

export function stampNote(outcome: StampOutcome | null): StampNote {
  // Coalesced before the switch, and not for tidiness. `read.ts` builds this
  // from a `select('*')` row, so on a deploy without
  // `20260831150000_studio_stamped_asset.sql` the column is absent and the value
  // is `undefined`. A `switch` on `undefined` matches no case here — including
  // `case null`, which is written for that exact deploy — and an exhaustive
  // switch with no `default` then returns `undefined`, so the one message about
  // US rather than them could never be shown in the one situation it describes.
  // The boundary in `read.ts` normalises too; this is the half that cannot be
  // walked around by a future caller.
  switch (outcome ?? null) {
    case 'stamped':
      return {
        title: 'Logo placed',
        body: 'Sized off the shorter edge, so it reads the same on a square post and a wide banner.',
        remedy: null,
        hasBothVersions: true,
      }

    case 'no_logo':
      return {
        title: 'No logo yet',
        body: 'Add one and every picture Sahoda draws from then on carries it. This one stays as it is.',
        remedy: BRAND_BRAIN,
        hasBothVersions: false,
      }

    case 'logo_unreadable':
      return {
        title: 'Sahoda could not read your logo file',
        body: 'So this picture has none. It is yours either way, and you were charged once. Replacing the file fixes the next one.',
        remedy: REPLACE_LOGO,
        hasBothVersions: false,
      }

    case 'failed':
      return {
        title: 'Sahoda could not place your logo on this one',
        body: 'The picture is yours either way, and you were charged once. Drawing another usually works.',
        remedy: null,
        hasBothVersions: false,
      }

    case 'skipped':
      return {
        title: 'You turned the logo off for this one',
        body: 'Nothing was placed, and nothing was charged for placing it. The next picture carries your logo unless you turn it off again.',
        remedy: null,
        hasBothVersions: false,
      }

    // ── NULL IS NOT A DEFAULT CASE ──────────────────────────────────────────
    // It is the fifth answer and the only one that is about US rather than
    // them: this picture predates logo placing, or the column is not applied on
    // this deploy. Nothing went wrong and nothing is missing, so there is no
    // remedy — and saying "no logo yet" here would be a lie about a workspace
    // that may well have had one at the time.
    case null:
      return {
        title: 'Made before Sahoda placed logos',
        body: 'Nothing went wrong. Pictures drawn from now on carry yours.',
        remedy: null,
        hasBothVersions: false,
      }
  }
}
