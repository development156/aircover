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
 *   · **Instagram is absent from BOTH lists.** That is still true.
 *
 * ── CORRECTED 2026-08-26, AND THE OLD VALUE HID A REAL FEATURE ───────────────
 * This paragraph used to read "LinkedIn and Google Business are absent from
 * `edit`. So of this product's four channels, exactly one — X — can have a
 * published post edited." That was true when it was written and is not true now.
 * MEASURED against `docs.zernio.com/api/openapi`, `POST /v1/posts/{postId}/edit`,
 * the platform enum is:
 *
 *   [twitter, discord, facebook, reddit, linkedin, telegram, pinterest,
 *    googlebusiness, youtube, slack]
 *
 * So LinkedIn and Google Business Profile CAN be edited, and this map was
 * refusing a capability the provider offers. A stale `null` here is not a
 * cautious default — it renders as a missing control, and nobody goes looking
 * for a button that was never drawn.
 *
 * A capability that does not exist is stated as absent, never rendered as a
 * control that fails when pressed.
 */

/** Zernio's name for a channel on `POST /v1/posts/{id}/edit`. Null where unsupported. */
const EDIT_PLATFORM: Readonly<Record<Channel, string | null>> = {
  x: 'twitter',
  linkedin: 'linkedin',
  // `googlebusiness`, matching the unpublish enum. Both endpoints name this
  // channel the same way and neither accepts the publish endpoint's `google`.
  gbp: 'googlebusiness',
  // Still absent from the enum. Instagram's own API has no edit for a feed post.
  instagram: null,
  facebook: 'facebook',
  telegram: 'telegram',
}

/** Zernio's name for a channel on `POST /v1/posts/{id}/unpublish`. Null where unsupported. */
const UNPUBLISH_PLATFORM: Readonly<Record<Channel, string | null>> = {
  x: 'twitter',
  linkedin: 'linkedin',
  // `googlebusiness`, NOT `google`. The publish endpoint's name for the same
  // channel is refused here — MEASURED, both directions.
  gbp: 'googlebusiness',
  instagram: null,
  // Both named in the enum: [threads, facebook, twitter, linkedin, youtube,
  // pinterest, reddit, bluesky, googlebusiness, telegram].
  facebook: 'facebook',
  telegram: 'telegram',
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
    return `Instagram posts can’t be ${what} from here. Open Instagram to change it.`
  }
  if (channel === 'gbp') {
    return `Google posts can’t be ${what} from here. Open your Business Profile to change it.`
  }
  if (channel === 'linkedin') {
    return `LinkedIn posts can’t be ${what} from here. Open LinkedIn to change it.`
  }
  return `This can’t be ${what} from here.`
}
