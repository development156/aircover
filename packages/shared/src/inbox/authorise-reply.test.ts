import { describe, it, expect } from 'vitest'

import { authoriseReply, evaluateSendWindow, type ReplyAffordance } from './send-window'

const T0 = '2026-08-08T00:00:00.000Z'
const at = (hours: number): string => new Date(Date.parse(T0) + hours * 3_600_000).toISOString()

const window = (platform: 'instagram' | 'facebook' | 'whatsapp', hours: number): ReplyAffordance =>
  evaluateSendWindow({ platform, lastInboundAt: T0, now: at(hours) })

/**
 * `authoriseReply` is the gate between a window and a wire payload.
 *
 * It exists because the client's idea of the window is a HINT. The browser knows what
 * the affordance said when the page rendered; by submit time the window may have
 * lapsed, and a tag the user picked may no longer be live. So the server re-derives the
 * affordance from freshly-read messages and asks this function — which is also the only
 * place that decides `messagingType`/`messageTag`, so the mapping cannot drift between
 * the UI's explanation and the bytes that go out.
 */
describe('authoriseReply — an open window sends free-form and tags nothing', () => {
  it.each(['instagram', 'facebook', 'whatsapp'] as const)('%s inside 24h', (platform) => {
    const decision = authoriseReply(window(platform, 1), { kind: 'free_form' })

    expect(decision.ok).toBe(true)
    if (!decision.ok) throw new Error('unreachable')
    // Neither field is guessed. `messagingType` is documented as Facebook's, and
    // inventing a RESPONSE for Instagram would be sending a field we have not verified.
    expect(decision.wire).toEqual({})
  })

  /**
   * ── THE RACE THIS DELIBERATELY ABSORBS ──────────────────────────────────────
   * The page rendered `tagged`, the user picked a tag, and the customer wrote again
   * before they pressed send — so the server re-derives `open`. An earlier version
   * REFUSED this, which was a dead end rather than a correction: a radio group has no
   * deselect, so the tag stays set and every retry refuses identically.
   *
   * The tag exists to justify a reply the window would otherwise forbid. With the
   * window open there is nothing to justify, so it is dropped and the reply goes
   * free-form — strictly less on the wire, and the outcome the user wanted.
   */
  it('drops a tag on an open window instead of refusing a reply it could send', () => {
    const decision = authoriseReply(window('instagram', 1), {
      kind: 'tagged',
      tag: 'HUMAN_AGENT',
    })

    expect(decision.ok).toBe(true)
    if (!decision.ok) throw new Error('unreachable')
    expect(decision.wire).toEqual({})
  })
})

describe('authoriseReply — a tagged window requires a tag the platform still allows', () => {
  it('pairs the tag with messagingType MESSAGE_TAG, which the API requires', () => {
    const decision = authoriseReply(window('instagram', 30), {
      kind: 'tagged',
      tag: 'HUMAN_AGENT',
    })

    expect(decision.ok).toBe(true)
    if (!decision.ok) throw new Error('unreachable')
    expect(decision.wire).toEqual({ messagingType: 'MESSAGE_TAG', messageTag: 'HUMAN_AGENT' })
  })

  it('refuses a free-form reply once the window has closed', () => {
    const decision = authoriseReply(window('facebook', 30), { kind: 'free_form' })

    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.reason.length).toBeGreaterThan(0)
  })

  /**
   * The defence this function exists for: Instagram supports exactly one tag, so a
   * Facebook-legal tag chosen in a stale browser tab must not reach Meta.
   */
  it('refuses a tag this platform does not offer, even though the tag is real', () => {
    const decision = authoriseReply(window('instagram', 30), {
      kind: 'tagged',
      tag: 'ACCOUNT_UPDATE',
    })

    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.reason).toMatch(/ACCOUNT_UPDATE/)
  })

  it('accepts every tag facebook still has live at 30h', () => {
    for (const tag of [
      'ACCOUNT_UPDATE',
      'CONFIRMED_EVENT_UPDATE',
      'POST_PURCHASE_UPDATE',
      'HUMAN_AGENT',
    ] as const) {
      expect(authoriseReply(window('facebook', 30), { kind: 'tagged', tag }).ok).toBe(true)
    }
  })

  /**
   * HUMAN_AGENT is the only TIMED tag, so past 168h Facebook keeps three and Instagram
   * — whose only tag it was — keeps none. The two platforms diverge here, which is why
   * the tag set is filtered per thread rather than read off the platform spec.
   */
  it('refuses HUMAN_AGENT after its 7-day window while the untimed tags survive', () => {
    expect(authoriseReply(window('facebook', 200), { kind: 'tagged', tag: 'HUMAN_AGENT' }).ok).toBe(
      false,
    )
    expect(
      authoriseReply(window('facebook', 200), { kind: 'tagged', tag: 'ACCOUNT_UPDATE' }).ok,
    ).toBe(true)
  })
})

describe('authoriseReply — the states that cannot send at all', () => {
  it('refuses WhatsApp out of window, because only a template can go', () => {
    const affordance = window('whatsapp', 30)
    expect(affordance.state).toBe('template_only')

    const decision = authoriseReply(affordance, { kind: 'free_form' })
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    // The refusal quotes the affordance's own sentence, so the UI's explanation and the
    // server's refusal can never disagree about why.
    expect(decision.reason).toBe(affordance.reason)
  })

  it('refuses a closed instagram thread', () => {
    const affordance = window('instagram', 200)
    expect(affordance.state).toBe('closed')
    expect(authoriseReply(affordance, { kind: 'free_form' }).ok).toBe(false)
  })

  /**
   * `unknown` must refuse. It is the state that means "we could not compute the window",
   * and sending into it would be exactly the submit-time failure the affordance exists
   * to prevent — with the added cost that we would have promised the user it was fine.
   */
  it('refuses an unknown window rather than trying and finding out', () => {
    const affordance = evaluateSendWindow({
      platform: 'instagram',
      lastInboundAt: null,
      now: at(1),
    })
    expect(affordance.state).toBe('unknown')

    const decision = authoriseReply(affordance, { kind: 'free_form' })
    expect(decision.ok).toBe(false)
    if (decision.ok) throw new Error('unreachable')
    expect(decision.reason).toBe(affordance.reason)
  })

  it('refuses a platform with no modelled window, such as telegram', () => {
    const affordance = evaluateSendWindow({
      platform: 'telegram',
      lastInboundAt: T0,
      now: at(1),
    })
    expect(affordance.state).toBe('unknown')
    expect(authoriseReply(affordance, { kind: 'free_form' }).ok).toBe(false)
  })
})

describe('canSendFromSahoda now varies, and only where a reply is genuinely possible', () => {
  it('is true exactly on open and tagged', () => {
    expect(window('instagram', 1).canSendFromSahoda).toBe(true)
    expect(window('instagram', 30).canSendFromSahoda).toBe(true)
  })

  it('is false on template_only, closed and unknown', () => {
    expect(window('whatsapp', 30).canSendFromSahoda).toBe(false)
    expect(window('instagram', 200).canSendFromSahoda).toBe(false)
    expect(
      evaluateSendWindow({ platform: 'instagram', lastInboundAt: null, now: at(1) })
        .canSendFromSahoda,
    ).toBe(false)
  })

  /**
   * The flag and the gate must agree in both directions. If `canSendFromSahoda` were
   * ever true where `authoriseReply` refuses, the UI would render a live compose box
   * over a reply that cannot be sent — the failure this whole module exists to prevent.
   */
  it('is true if and only if some intent is authorised', () => {
    const cases: ReplyAffordance[] = [
      window('instagram', 1),
      window('instagram', 30),
      window('instagram', 200),
      window('facebook', 1),
      window('facebook', 30),
      window('facebook', 200),
      window('whatsapp', 1),
      window('whatsapp', 30),
      evaluateSendWindow({ platform: 'instagram', lastInboundAt: null, now: at(1) }),
      evaluateSendWindow({ platform: 'telegram', lastInboundAt: T0, now: at(1) }),
    ]

    for (const affordance of cases) {
      const anyAuthorised =
        authoriseReply(affordance, { kind: 'free_form' }).ok ||
        (affordance.state === 'tagged' &&
          affordance.tags.some((tag) => authoriseReply(affordance, { kind: 'tagged', tag }).ok))

      expect({ state: affordance.state, can: affordance.canSendFromSahoda }).toEqual({
        state: affordance.state,
        can: anyAuthorised,
      })
    }
  })
})
