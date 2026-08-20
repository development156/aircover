import type { Channel } from '@sahoda/shared'

/**
 * WHAT CAN BE DONE TO A POST AFTER IT HAS GONE OUT — edit it, take it down, try
 * again — and, per channel, whether Zernio will do it at all.
 *
 * ── THE API HAS THREE DIFFERENT PLATFORM VOCABULARIES ───────────────────────
 * This is the finding, and nothing about it is guessable. MEASURED 2026-08-20 by
 * calling each endpoint with an ObjectId that cannot exist
 * (`ffffffffffffffffffffffff`), so a real post could never be reached:
 *
 *   1. `POST /v1/posts` — publish — takes `x` and `google`. [LIVE]: real posts
 *      have gone out through those exact strings.
 *   2. `POST /v1/tools/validate/post` — takes `twitter` and `googlebusiness`, and
 *      SILENTLY SKIPS anything else (docs/32 §1.1).
 *   3. `POST /v1/posts/{id}/edit` — its 400 names its whole enum:
 *      *"expected one of \"twitter\"|\"discord\"|\"facebook\"|\"reddit\""*.
 *   4. `POST /v1/posts/{id}/unpublish` — its 400 names a DIFFERENT list:
 *      *"facebook, youtube, linkedin, twitter, threads, pinterest, reddit,
 *      bluesky, googlebusiness, telegram, whatsapp, discord, slack"*.
 *
 * Two consequences that a reasonable person would have got wrong:
 *
 *   · **`ZERNIO_PLATFORM_NAME` MUST NOT BE REUSED HERE.** It maps `gbp` →
 *     `'google'`, which publish accepts and unpublish REFUSES by name. A tidy
 *     unification of the four vocabularies would break either publishing or
 *     recovery, and the one it broke would depend on which map won.
 *   · **Instagram is absent from BOTH lists**, and LinkedIn and Google Business
 *     are absent from `edit`. So of this product's four channels, exactly one —
 *     X — can have a published post edited.
 *
 * A capability that does not exist is stated as absent, never rendered as a
 * control that fails when pressed.
 */

/** Zernio's name for a channel on `POST /v1/posts/{id}/edit`. Null where unsupported. */
const EDIT_PLATFORM: Readonly<Record<Channel, string | null>> = {
  x: 'twitter',
  // Named in neither the enum nor the error text. Editing a LinkedIn post is a
  // thing LinkedIn itself allows and Zernio does not expose.
  linkedin: null,
  gbp: null,
  instagram: null,
}

/** Zernio's name for a channel on `POST /v1/posts/{id}/unpublish`. Null where unsupported. */
const UNPUBLISH_PLATFORM: Readonly<Record<Channel, string | null>> = {
  x: 'twitter',
  linkedin: 'linkedin',
  // `googlebusiness`, NOT `google`. The publish endpoint's name for the same
  // channel is refused here — MEASURED, both directions.
  gbp: 'googlebusiness',
  instagram: null,
}

export type RecoveryAction = 'edit' | 'unpublish' | 'retry'

/**
 * The platform string this action needs for this channel, or null if Zernio does
 * not offer the action there.
 *
 * `retry` returns an empty string rather than null for every channel: it is a
 * POST-level operation and takes no platform at all (MEASURED — a dead id 404s
 * before any body is read, and no body is required).
 */
export function recoveryPlatform(channel: Channel, action: RecoveryAction): string | null {
  if (action === 'retry') return ''
  return (action === 'edit' ? EDIT_PLATFORM : UNPUBLISH_PLATFORM)[channel]
}

export function canRecover(channel: Channel, action: RecoveryAction): boolean {
  return recoveryPlatform(channel, action) !== null
}

/**
 * What to tell someone about an action this channel does not have.
 *
 * Says WHO cannot do it, because "not supported" invites the reasonable question
 * of whether it is Sahoda being lazy. It is Zernio's list, and the sentence says
 * so without naming a vendor the reader has no relationship with.
 */
export function recoveryUnavailableReason(channel: Channel, action: RecoveryAction): string | null {
  if (canRecover(channel, action)) return null
  const what = action === 'edit' ? 'edited' : 'taken down'
  if (channel === 'instagram') {
    return `Instagram posts can’t be ${what} from here — open Instagram to change it.`
  }
  if (channel === 'gbp') {
    return `Google posts can’t be ${what} from here — open your Business Profile to change it.`
  }
  if (channel === 'linkedin') {
    return `LinkedIn posts can’t be ${what} from here — open LinkedIn to change it.`
  }
  return `This can’t be ${what} from here.`
}
