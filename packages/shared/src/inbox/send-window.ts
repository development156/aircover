import { z } from 'zod'

/**
 * Messaging send windows — what a platform will let you say, and when.
 *
 * ── WHY THIS IS A TYPE AND NOT A RUNTIME CHECK ───────────────────────────────
 * Every messaging platform closes free-form replies some hours after the customer's
 * last inbound message. Discovering that at submit time means the user writes a reply,
 * presses send, and gets a rejection from Meta — having already spent the effort. The
 * window is knowable BEFORE the compose box renders, so it belongs in the affordance:
 * an out-of-window thread should explain itself, not fail.
 *
 * ── PROVENANCE ───────────────────────────────────────────────────────────────
 * `[DOC]` per doc 13's evidence tiers — sourced from the platforms' own messaging
 * policies, NOT observed live through Zernio. Doc 13 §12 records no messaging-window
 * behaviour at all. Treat the hour counts as the published contract, not as a
 * measurement, and re-tier them to `[LIVE]` only after a send surface observes a
 * real rejection.
 *
 * Nothing here sends. This module decides what the UI may OFFER and what payload the
 * send surface is AUTHORISED to build — `authoriseReply` is the only place that maps a
 * window to Zernio's `messagingType`/`messageTag` fields, so the sentence shown to the
 * user and the bytes put on the wire cannot drift apart.
 */

/** Platforms that can appear on a Zernio `/inbox/*` row. Not the publishable `Channel` set. */
export const InboxPlatformSchema = z.enum([
  'facebook',
  'instagram',
  'whatsapp',
  'twitter',
  'bluesky',
  'reddit',
  'telegram',
  'googlebusiness',
])
export type InboxPlatform = z.infer<typeof InboxPlatformSchema>

/** Meta's message tags — the only way to reopen a lapsed free-form window. */
export const MessageTagSchema = z.enum([
  'ACCOUNT_UPDATE',
  'CONFIRMED_EVENT_UPDATE',
  'POST_PURCHASE_UPDATE',
  'HUMAN_AGENT',
])
export type MessageTag = z.infer<typeof MessageTagSchema>

/** The three platforms with a modelled reply window. */
export type MessagingPlatform = 'facebook' | 'instagram' | 'whatsapp'

/** Free-form replies close this long after the customer's last inbound message. */
export const STANDARD_WINDOW_HOURS = 24

/** HUMAN_AGENT buys a longer window than the other tags — and only this one is timed. */
export const HUMAN_AGENT_WINDOW_HOURS = 168

/** Per-tag lifetime past the inbound message. `null` = untimed (use-restricted instead). */
const TAG_WINDOW_HOURS: Record<MessageTag, number | null> = {
  HUMAN_AGENT: HUMAN_AGENT_WINDOW_HOURS,
  ACCOUNT_UPDATE: null,
  CONFIRMED_EVENT_UPDATE: null,
  POST_PURCHASE_UPDATE: null,
}

export interface SendWindowSpec {
  platform: MessagingPlatform
  standardWindowHours: number
  /** Tags that can carry a reply once the standard window lapses. Empty ⇒ none exist. */
  tags: readonly MessageTag[]
  /** What the platform falls back to out of window. */
  outOfWindow: 'tagged' | 'template_only'
}

/**
 * The three regimes, which are genuinely different — not three settings of one rule.
 * Instagram has exactly one tag; Facebook has four; WhatsApp has none and swaps to
 * pre-approved templates instead.
 */
export const SEND_WINDOWS: Record<MessagingPlatform, SendWindowSpec> = {
  instagram: {
    platform: 'instagram',
    standardWindowHours: STANDARD_WINDOW_HOURS,
    tags: ['HUMAN_AGENT'],
    outOfWindow: 'tagged',
  },
  facebook: {
    platform: 'facebook',
    standardWindowHours: STANDARD_WINDOW_HOURS,
    tags: ['ACCOUNT_UPDATE', 'CONFIRMED_EVENT_UPDATE', 'POST_PURCHASE_UPDATE', 'HUMAN_AGENT'],
    outOfWindow: 'tagged',
  },
  whatsapp: {
    platform: 'whatsapp',
    standardWindowHours: STANDARD_WINDOW_HOURS,
    tags: [],
    outOfWindow: 'template_only',
  },
}

interface AffordanceBase {
  platform: InboxPlatform
  /** UI-ready sentence. Renders verbatim; never asserts anything about the customer. */
  reason: string
}

/**
 * `unknown` is a first-class state, not a fallback.
 *
 * The conversations LIST cannot compute a window: `ZernioConversation` carries only
 * `updatedTime` (last activity, either direction), while the window depends on the
 * newest INBOUND message's timestamp — which only `listMessages` returns. Rendering a
 * hard "cannot reply" badge from list data would be asserting something unverified.
 * So the list gets `unknown`, and the thread view gets the definite answer.
 *
 * `updatedTime` cannot stand in for it even approximately, and the reason is worth
 * stating: it advances on OUR OWN reply. Deriving a window from it would mean every
 * reply we send re-opens the window we just used, which reads as a working feature and
 * is a fabrication. Now that sending is wired, that is no longer hypothetical.
 *
 * ── `canSendFromSahoda` IS A LITERAL ON EACH VARIANT, NEVER A WIDENED BOOLEAN ─
 * It was `false` everywhere while reads were the only wired surface, with a comment
 * saying that wiring a send path had to change this file deliberately. This is that
 * change. Per-variant rather than computed means `=== true` narrows to exactly the two
 * states a reply can leave from, so a caller cannot hold a `closed` affordance and a
 * send handle at once — and a NEW state must pick a side rather than inherit a
 * permissive default from the shared base.
 */
export type ReplyAffordance =
  | (AffordanceBase & { state: 'open'; closesAt: string; canSendFromSahoda: true })
  | (AffordanceBase & {
      state: 'tagged'
      tags: readonly MessageTag[]
      closesAt: string | null
      canSendFromSahoda: true
    })
  | (AffordanceBase & { state: 'template_only'; canSendFromSahoda: false })
  | (AffordanceBase & { state: 'closed'; canSendFromSahoda: false })
  | (AffordanceBase & { state: 'unknown'; canSendFromSahoda: false })

/** The two states a reply can actually leave from. `=== true` narrows to exactly this. */
export type SendableAffordance = Extract<ReplyAffordance, { canSendFromSahoda: true }>

export interface SendWindowInput {
  platform: InboxPlatform
  /** ISO timestamp of the newest INBOUND message. `null` when no thread has been read. */
  lastInboundAt: string | null | undefined
  /** Passed in, never read from the clock, so the result is testable and cacheable. */
  now: string
}

const addHours = (isoMs: number, hours: number): string =>
  new Date(isoMs + hours * 3_600_000).toISOString()

const unknown = (platform: InboxPlatform, reason: string): ReplyAffordance => ({
  state: 'unknown',
  platform,
  reason,
  canSendFromSahoda: false,
})

/**
 * Decide what a reply UI may offer for one thread.
 *
 * Never throws. Every unreadable input resolves to `unknown` rather than to `open`
 * (which would promise a reply we cannot make) or `closed` (which would deny one the
 * platform might allow).
 */
export function evaluateSendWindow({
  platform,
  lastInboundAt,
  now,
}: SendWindowInput): ReplyAffordance {
  const spec = (SEND_WINDOWS as Partial<Record<InboxPlatform, SendWindowSpec>>)[platform]
  if (!spec) {
    return unknown(platform, `Sahoda does not model a reply window for ${platform} yet.`)
  }

  if (!lastInboundAt) {
    return unknown(
      platform,
      'Sahoda has not read this thread’s messages yet, so the reply window is not known. Open the thread to check.',
    )
  }

  const inboundMs = Date.parse(lastInboundAt)
  const nowMs = Date.parse(now)
  if (Number.isNaN(inboundMs) || Number.isNaN(nowMs)) {
    return unknown(
      platform,
      'This thread’s last message has no readable timestamp, so the reply window is not known.',
    )
  }

  const elapsedHours = (nowMs - inboundMs) / 3_600_000

  // A future inbound timestamp is clock skew, not a negative age — stay open.
  if (elapsedHours < spec.standardWindowHours) {
    return {
      state: 'open',
      platform,
      closesAt: addHours(inboundMs, spec.standardWindowHours),
      reason: `Replies are open. ${platform} allows a free-form reply for ${spec.standardWindowHours} hours after the customer’s last message.`,
      canSendFromSahoda: true,
    }
  }

  if (spec.outOfWindow === 'template_only') {
    return {
      state: 'template_only',
      platform,
      reason: `WhatsApp closed the ${spec.standardWindowHours}-hour service window on this thread. Only a pre-approved template message can be sent until the customer writes again.`,
      canSendFromSahoda: false,
    }
  }

  const live = spec.tags.filter((tag) => {
    const limit = TAG_WINDOW_HOURS[tag]
    return limit === null || elapsedHours < limit
  })

  if (live.length === 0) {
    return {
      state: 'closed',
      platform,
      reason: `The ${HUMAN_AGENT_WINDOW_HOURS / 24}-day HUMAN_AGENT window on this ${platform} thread has lapsed. The customer needs to write again before a reply is possible.`,
      canSendFromSahoda: false,
    }
  }

  // When the tag set itself is timed, say when it narrows; untimed tags give no date.
  const soonestLapse = live
    .map((tag) => TAG_WINDOW_HOURS[tag])
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b)[0]

  const onlyTag = live.length === 1 ? live[0] : undefined
  const closedSentence = `${platform} closed the free-form reply window ${spec.standardWindowHours} hours after the customer’s last message.`

  return {
    state: 'tagged',
    platform,
    tags: live,
    closesAt: soonestLapse === undefined ? null : addHours(inboundMs, soonestLapse),
    reason: onlyTag
      ? `${closedSentence} Only a ${onlyTag}-tagged reply is allowed from here.`
      : `${closedSentence} A reply now has to carry one of its message tags.`,
    canSendFromSahoda: true,
  }
}

/**
 * What the user is trying to send. Free-form inside the window; tagged once it lapses.
 *
 * A discriminated union rather than an optional `tag?: MessageTag`, because "no tag"
 * and "a tag" are different requests with different legality — and an optional field
 * lets a caller forget the tag on a thread that requires one, which is precisely the
 * submit-time rejection this module exists to prevent.
 */
export type ReplyIntent = { kind: 'free_form' } | { kind: 'tagged'; tag: MessageTag }

/**
 * The Zernio send fields an authorised reply may carry. Empty object = neither field.
 *
 * `messagingType` is documented as Facebook's, and `messageTag` is documented as
 * requiring `messagingType: 'MESSAGE_TAG'`. So the two are minted together here and
 * nowhere else — a caller cannot send one without the other, which is a 400 from Meta.
 */
export interface ReplyWireFields {
  messagingType?: 'MESSAGE_TAG'
  messageTag?: MessageTag
}

export type ReplyAuthorisation = { ok: true; wire: ReplyWireFields } | { ok: false; reason: string }

/**
 * Decide whether a reply may be sent, and with what tag fields.
 *
 * ── WHY THE SERVER RE-DERIVES THE AFFORDANCE AND CALLS THIS AGAIN ────────────
 * The affordance the browser rendered is a HINT with an expiry. A tab left open across
 * the 24-hour boundary still shows a live compose box; a `tagged` thread's HUMAN_AGENT
 * option lapses at 168h while the page sits there. So the send path reads the thread
 * again, re-evaluates the window against the current clock, and asks this function —
 * which refuses in exactly the cases the UI would have refused, using the SAME sentence.
 *
 * The refusal quotes `affordance.reason` verbatim rather than composing its own copy.
 * Two sentences for one fact drift, and the drift shows up as a user being told one
 * thing by the page and a different thing by the error.
 */
export function authoriseReply(
  affordance: ReplyAffordance,
  intent: ReplyIntent,
): ReplyAuthorisation {
  if (!affordance.canSendFromSahoda) {
    // Covers template_only, closed and unknown. `unknown` refusing is the point: it
    // means the window could not be computed, and sending anyway would be a guess
    // dressed as a promise.
    return { ok: false, reason: affordance.reason }
  }

  if (affordance.state === 'open') {
    // A tag on an OPEN window is DROPPED, not refused.
    //
    // This is the race the re-derivation creates: the page rendered `tagged`, the user
    // picked a tag, and the customer wrote again before they pressed send — so by the
    // time the server looks, the free-form window has reopened. Refusing here would be a
    // dead end rather than a correction: a radio group has no deselect, so the tag stays
    // set, every retry refuses identically, and the only escape is a page reload the
    // message does not mention.
    //
    // Dropping it is safe in the direction that matters. The tag exists to justify a
    // reply the window would otherwise forbid; with the window open there is nothing to
    // justify, so sending without it is strictly LESS on the wire and cannot be refused
    // by Meta for a reason the tag would have fixed.
    //
    // Nothing is guessed onto the wire either way. `messagingType: 'RESPONSE'` would be a
    // field we have never verified against Instagram, sent on the strength of a Facebook
    // doc line about a different platform.
    return { ok: true, wire: {} }
  }

  // `state === 'tagged'` — the free-form window has lapsed and only a tag can carry it.
  if (intent.kind === 'free_form') {
    return { ok: false, reason: affordance.reason }
  }

  // Checked against THIS THREAD's live tags, not the platform's full set: HUMAN_AGENT is
  // the only timed tag, so at 200h Facebook still has three and Instagram has none.
  if (!affordance.tags.includes(intent.tag)) {
    return {
      ok: false,
      reason: `${intent.tag} is not available on this ${affordance.platform} thread. ${affordance.reason}`,
    }
  }

  return { ok: true, wire: { messagingType: 'MESSAGE_TAG', messageTag: intent.tag } }
}
