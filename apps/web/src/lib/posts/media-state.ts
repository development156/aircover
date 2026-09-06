import type { PostMedia } from '@sahoda/shared'

import type { CropOfferView } from '../media/offer-state'
import type { ChannelRejection } from './attach-decision'

/**
 * Media action state. Lives outside the `'use server'` module that returns it —
 * such a file may export only async functions, and re-exporting a type from one
 * makes Turbopack dev emit a runtime `ReferenceError` that 500s every route
 * importing the action (LEARNINGS.md).
 */

/**
 * `warnings` on the success arm are channels that will NOT use the file even
 * though it was attached — a gif is fine for X and useless for GBP. They are
 * carried rather than dropped so the editor can say so; an attach that silently
 * ignored half the post's channels would read as fully successful.
 */
/**
 * ── THE OFFER RIDES ON THE REFUSAL, IT DOES NOT REPLACE IT ──────────────────
 * `ok` is still false, `message` is still the sentence the engine composed, and
 * still nothing was written. `offer` is an extra: here is the crop Sahoda would
 * make. Declining leaves the refusal exactly as it was before this shape gained
 * a field — which is the safest change that can be made to a publish-path
 * refusal, and it is why the decline case needs no new code to keep working.
 *
 * `noOffer` says why there is not one, when there is not. "Too small to crop"
 * and "these channels want contradictory shapes" are different situations and a
 * person can act on the first.
 */
export type AttachMediaState =
  | {
      ok: true
      media: PostMedia
      warnings: ChannelRejection[]
      /**
       * Set when the file was re-encoded into another container so every channel
       * on this post could take it. One calm line, not a warning: nothing went
       * wrong and nothing needs doing. Absent on the ordinary path.
       *
       * Optional rather than nullable so every existing construction of this
       * state still compiles — a required field here would break each one, and a
       * conversion that did not happen has nothing to say.
       */
      converted?: string
    }
  | {
      ok: false
      message: string
      rejections?: ChannelRejection[]
      offer?: CropOfferView
      noOffer?: string
    }

export type DetachMediaState = { ok: true } | { ok: false; message: string }
