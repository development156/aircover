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
 * Nothing here sends. This module decides what the UI may OFFER; `canSendFromSahoda`
 * is `false` on every result because the write surface is not wired (reads only).
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
  /**
   * Reads are the only wired surface, so this is `false` everywhere. It is a literal
   * type, not a boolean: wiring a send surface has to change this file deliberately.
   */
  canSendFromSahoda: false
}

/**
 * `unknown` is a first-class state, not a fallback.
 *
 * The conversations LIST cannot compute a window: `ZernioConversation` carries only
 * `updatedTime` (last activity, either direction), while the window depends on the
 * newest INBOUND message's timestamp — which only `listMessages` returns. Rendering a
 * hard "cannot reply" badge from list data would be asserting something unverified.
 * So the list gets `unknown`, and the thread view gets the definite answer.
 */
export type ReplyAffordance =
  | (AffordanceBase & { state: 'open'; closesAt: string })
  | (AffordanceBase & { state: 'tagged'; tags: readonly MessageTag[]; closesAt: string | null })
  | (AffordanceBase & { state: 'template_only' })
  | (AffordanceBase & { state: 'closed' })
  | (AffordanceBase & { state: 'unknown' })

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
      reason: `Replies are open — ${platform} allows a free-form reply for ${spec.standardWindowHours} hours after the customer’s last message.`,
      canSendFromSahoda: false,
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
    canSendFromSahoda: false,
  }
}
