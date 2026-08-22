import { afterEach, describe, expect, it, vi } from 'vitest'

import { websiteCell, type DoorOutcome } from './door-outcome'
import { readSite } from './read-site'

/**
 * THE FOUR SENTENCES, EXECUTED.
 *
 * `door-transport-failure.ts` exists because `door-step.tsx` collapsed every
 * non-ok response into one sentence — "We could not read that" — which is a
 * CLAIM ABOUT THE CUSTOMER'S WEBSITE and is wrong on all four arms, because on
 * all four the page was never opened. The rebuild carries those four through a
 * new caller, and carrying them is not the same as reaching a screen with them.
 * These tests run the caller.
 */

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A streamed NDJSON body, which is what the route returns on the ok path. */
function stream(lines: unknown[]): Response {
  const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  return new Response(new TextEncoder().encode(text), { status: 200 })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a request that never produced a verdict about the document', () => {
  const ARMS = [
    { code: 'signed_out', status: 401, fatal: true },
    { code: 'no_workspace', status: 400, fatal: true },
    { code: 'workspace_unreadable', status: 503, fatal: false },
    { code: 'failed', status: 500, fatal: false },
  ] as const

  it('gives each named cause its OWN sentence', async () => {
    const messages: string[] = []
    for (const arm of ARMS) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(arm.status, { error: arm.code })))
      const outcome = await readSite('https://example.com')
      expect(outcome.kind).toBe('blocked')
      if (outcome.kind !== 'blocked') throw new Error('unreachable')
      messages.push(outcome.message)
    }
    // Four arms, four different sentences. This is the assertion the collapsed
    // version could never have passed.
    expect(new Set(messages).size).toBe(4)
  })

  it('never says anything about the page, because the page was never opened', async () => {
    for (const arm of ARMS) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(arm.status, { error: arm.code })))
      const outcome = await readSite('https://example.com')
      if (outcome.kind !== 'blocked') throw new Error('expected blocked')
      // A verdict on the document is exactly what may not appear here.
      expect(outcome.message).not.toMatch(/could not read that|unreadable site|your site is/i)
      expect(outcome.message).toMatch(/link or PDF|website/i)
    }
  })

  /**
   * Fatal means there is NOWHERE TO SAVE. Offering "carry on" on either of these
   * walks the user into a resolve that returns "Create a workspace first" — a
   * dead end dressed as a way forward.
   */
  it('marks exactly the two arms with nowhere to save as fatal', async () => {
    const fatal: string[] = []
    for (const arm of ARMS) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(arm.status, { error: arm.code })))
      const outcome = await readSite('https://example.com')
      if (outcome.kind !== 'blocked') throw new Error('expected blocked')
      if (outcome.fatal) fatal.push(arm.code)
      // A retry is offered only where a retry is the remedy.
      expect(outcome.retryable).toBe(!arm.fatal)
    }
    expect(fatal).toEqual(['signed_out', 'no_workspace'])
  })

  it('does not crash on a platform 502 that carries HTML rather than JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 })),
    )
    const outcome = await readSite('https://example.com')
    expect(outcome.kind).toBe('blocked')
    if (outcome.kind !== 'blocked') throw new Error('unreachable')
    expect(outcome.message).toMatch(/did not reach Sahoda/i)
  })

  it('treats a dropped connection as a request fault, not a bad page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    const outcome = await readSite('https://example.com')
    expect(outcome.kind).toBe('blocked')
    if (outcome.kind !== 'blocked') throw new Error('unreachable')
    expect(outcome.message).toMatch(/never opened|not a verdict/i)
  })
})

describe('a read that HAPPENED', () => {
  it('carries the page text through when the server read it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        stream([
          { type: 'stage', detail: 'fetched', ms: 900 },
          {
            type: 'done',
            result: {
              ok: true,
              kind: 'url',
              text: 'We have poured chai on Residency Road since 2014.',
              label: 'chaiandchapters.in',
              foundName: 'Chai & Chapters',
              // Valid CSS colours in rgb() form rather than hex, because
              // design-lint rule 1 is at zero across apps/web/src and a fixture
              // is not an exception to it. `readSite` passes these through
              // untouched, so the arity and the pass-through are what this
              // proves; the notation is free.
              colors: ['rgb(255, 102, 0)', 'rgb(17, 17, 17)'],
              note: null,
              fellBack: false,
            },
          },
        ]),
      ),
    )
    const outcome = await readSite('chaiandchapters.in')
    expect(outcome.kind).toBe('read')
    if (outcome.kind !== 'read') throw new Error('unreachable')
    expect(outcome.text).toContain('Residency Road')
    expect(outcome.colors).toHaveLength(2)
  })

  /** A read that ran and produced a NEGATIVE verdict. This one IS about the page. */
  it('keeps the server’s own sentence when the page was fetched and made no sense', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          stream([
            { type: 'done', result: { ok: false, message: 'That page had almost no text.' } },
          ]),
        ),
    )
    const outcome = await readSite('https://example.com')
    expect(outcome).toEqual({ kind: 'unread', message: 'That page had almost no text.' })
  })

  it('does not invent a verdict when the stream ends without one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(stream([{ type: 'stage', detail: 'x', ms: 1 }])),
    )
    const outcome = await readSite('https://example.com')
    expect(outcome.kind).toBe('blocked')
  })
})

describe('websiteCell — the result card says which of the five happened', () => {
  const CASES: [DoorOutcome, string][] = [
    [{ kind: 'none' }, 'Not given'],
    [{ kind: 'reading' }, 'Reading'],
    [
      { kind: 'read', text: 't', label: 'chaiandchapters.in', foundName: 'C', colors: [] },
      'chaiandchapters.in',
    ],
    [{ kind: 'unread', message: 'm' }, 'chaiandchapters.in · not read'],
    [
      { kind: 'blocked', message: 'm', retryable: true, fatal: false },
      'chaiandchapters.in · read did not run',
    ],
  ]

  it('gives five distinct answers', () => {
    const rendered = CASES.map(([o]) => websiteCell(o, 'chaiandchapters.in'))
    expect(rendered).toEqual(CASES.map(([, expected]) => expected))
    expect(new Set(rendered).size).toBe(5)
  })

  /**
   * The distinction the whole file turns on: "not read" is a verdict on the page
   * and is only allowed on the arm where a page was actually fetched.
   */
  it('does not say "not read" about a page nothing ever fetched', () => {
    expect(
      websiteCell({ kind: 'blocked', message: 'm', retryable: true, fatal: false }, 'x.com'),
    ).not.toContain('not read')
    expect(websiteCell({ kind: 'none' }, 'x.com')).not.toContain('not read')
  })
})
