import { describe, it, expect } from 'vitest'

import {
  SEND_WINDOWS,
  STANDARD_WINDOW_HOURS,
  HUMAN_AGENT_WINDOW_HOURS,
  evaluateSendWindow,
  type ReplyAffordance,
} from './send-window'

const T0 = '2026-08-08T00:00:00.000Z'
const at = (hours: number): string => new Date(Date.parse(T0) + hours * 3_600_000).toISOString()

describe('send-window specs', () => {
  it('models exactly the three messaging platforms Zernio can reply on', () => {
    expect(Object.keys(SEND_WINDOWS).sort()).toEqual(['facebook', 'instagram', 'whatsapp'])
  })

  it('gives instagram HUMAN_AGENT and nothing else', () => {
    expect(SEND_WINDOWS.instagram.tags).toEqual(['HUMAN_AGENT'])
  })

  it('gives facebook all four message tags', () => {
    expect([...SEND_WINDOWS.facebook.tags].sort()).toEqual([
      'ACCOUNT_UPDATE',
      'CONFIRMED_EVENT_UPDATE',
      'HUMAN_AGENT',
      'POST_PURCHASE_UPDATE',
    ])
  })

  it('gives whatsapp no tags at all — it is template-only out of window', () => {
    expect(SEND_WINDOWS.whatsapp.tags).toEqual([])
    expect(SEND_WINDOWS.whatsapp.outOfWindow).toBe('template_only')
  })
})

describe('evaluateSendWindow — inside the standard window', () => {
  it.each(['instagram', 'facebook', 'whatsapp'] as const)('%s is open before 24h', (platform) => {
    const r = evaluateSendWindow({ platform, lastInboundAt: T0, now: at(23) })
    expect(r.state).toBe('open')
    if (r.state !== 'open') throw new Error('unreachable')
    expect(r.closesAt).toBe(at(STANDARD_WINDOW_HOURS))
  })

  it('closes the standard window at exactly 24h, not after', () => {
    const r = evaluateSendWindow({ platform: 'whatsapp', lastInboundAt: T0, now: at(24) })
    expect(r.state).toBe('template_only')
  })
})

describe('evaluateSendWindow — instagram', () => {
  it('falls to HUMAN_AGENT-only past 24h and says when that lapses', () => {
    const r = evaluateSendWindow({ platform: 'instagram', lastInboundAt: T0, now: at(25) })
    expect(r.state).toBe('tagged')
    if (r.state !== 'tagged') throw new Error('unreachable')
    expect(r.tags).toEqual(['HUMAN_AGENT'])
    expect(r.closesAt).toBe(at(HUMAN_AGENT_WINDOW_HOURS))
  })

  it('closes entirely once the 7-day HUMAN_AGENT window lapses', () => {
    const r = evaluateSendWindow({ platform: 'instagram', lastInboundAt: T0, now: at(169) })
    expect(r.state).toBe('closed')
  })
})

describe('evaluateSendWindow — facebook', () => {
  it('offers all four tags past 24h', () => {
    const r = evaluateSendWindow({ platform: 'facebook', lastInboundAt: T0, now: at(25) })
    expect(r.state).toBe('tagged')
    if (r.state !== 'tagged') throw new Error('unreachable')
    expect(r.tags).toContain('HUMAN_AGENT')
    expect(r.tags).toHaveLength(4)
  })

  it('drops HUMAN_AGENT past 7 days but keeps the three untimed tags', () => {
    const r = evaluateSendWindow({ platform: 'facebook', lastInboundAt: T0, now: at(169) })
    expect(r.state).toBe('tagged')
    if (r.state !== 'tagged') throw new Error('unreachable')
    expect(r.tags).not.toContain('HUMAN_AGENT')
    expect([...r.tags].sort()).toEqual([
      'ACCOUNT_UPDATE',
      'CONFIRMED_EVENT_UPDATE',
      'POST_PURCHASE_UPDATE',
    ])
    expect(r.closesAt).toBeNull()
  })
})

describe('evaluateSendWindow — whatsapp', () => {
  it('is template-only past 24h, never merely closed', () => {
    const r = evaluateSendWindow({ platform: 'whatsapp', lastInboundAt: T0, now: at(24.5) })
    expect(r.state).toBe('template_only')
  })

  it('stays template-only however old the thread gets', () => {
    const r = evaluateSendWindow({ platform: 'whatsapp', lastInboundAt: T0, now: at(9000) })
    expect(r.state).toBe('template_only')
  })
})

describe('evaluateSendWindow — what we refuse to claim', () => {
  it.each(['instagram', 'facebook', 'whatsapp'] as const)(
    '%s is unknown with no observed inbound message, never open and never closed',
    (platform) => {
      const r = evaluateSendWindow({ platform, lastInboundAt: null, now: T0 })
      expect(r.state).toBe('unknown')
    },
  )

  it('is unknown for a platform we do not model, and says so by name', () => {
    const r = evaluateSendWindow({ platform: 'telegram', lastInboundAt: T0, now: at(1) })
    expect(r.state).toBe('unknown')
    expect(r.reason).toContain('telegram')
  })

  it('is unknown — not a crash, not open — on an unparseable timestamp', () => {
    const r = evaluateSendWindow({ platform: 'instagram', lastInboundAt: 'yesterday', now: T0 })
    expect(r.state).toBe('unknown')
  })

  it('treats a future inbound timestamp as open rather than computing negative age', () => {
    const r = evaluateSendWindow({ platform: 'facebook', lastInboundAt: at(5), now: T0 })
    expect(r.state).toBe('open')
  })

  it('gives every non-open state a reason the UI can render verbatim', () => {
    const cases: ReplyAffordance[] = [
      evaluateSendWindow({ platform: 'instagram', lastInboundAt: T0, now: at(25) }),
      evaluateSendWindow({ platform: 'instagram', lastInboundAt: T0, now: at(200) }),
      evaluateSendWindow({ platform: 'whatsapp', lastInboundAt: T0, now: at(25) }),
      evaluateSendWindow({ platform: 'instagram', lastInboundAt: null, now: T0 }),
    ]
    for (const c of cases) {
      expect(c.state).not.toBe('open')
      if (c.state === 'open') throw new Error('unreachable')
      expect(c.reason.length).toBeGreaterThan(0)
      // Never a claim about the customer's shop, and never a bare failure.
      expect(c.reason).not.toMatch(/no messages|nobody|error/i)
    }
  })

  /**
   * This assertion used to read `toBe(false)` — reads were the only wired surface, and
   * the flag was the literal `false` on every result so that wiring a send path could
   * not happen by accident. The send path is now wired, and this is the deliberate
   * change that file's comment asked for.
   *
   * What did NOT change is that the flag is a per-variant literal: it is true here
   * because `open` is one of exactly two states a reply can leave from, not because a
   * boolean got widened. `authorise-reply.test.ts` holds the flag and the gate to the
   * same answer in both directions.
   */
  it('reports an open thread as replyable, now that the send path exists', () => {
    const r = evaluateSendWindow({ platform: 'instagram', lastInboundAt: T0, now: at(1) })
    expect(r.state).toBe('open')
    expect(r.canSendFromSahoda).toBe(true)
  })
})
