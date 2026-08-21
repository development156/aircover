import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { decideStoreSurface } from './store-decision'

/**
 * The claims a store-backed inbox is entitled to make.
 *
 * These assert the CLAIM and the FORBIDDEN CLAIM, never the wording — the same
 * discipline `emptiness.test.ts` uses, so the copy can be rewritten freely while the
 * guarantee holds.
 */

const base = { surface: 'conversations', connectedAccounts: 1, storedRows: 0 } as const

describe('decideStoreSurface', () => {
  it('shows rows when the store has them', () => {
    const d = decideStoreSurface({ ...base, storedRows: 3, eventsEverReceived: true })
    expect(d.state).toBe('ok')
    expect(d.showList).toBe(true)
  })

  // ── THE STATE THE LIVE CLASSIFIER HAS NO WORD FOR ────────────────────────

  it('does NOT claim the inbox is empty before the first event has arrived', () => {
    // Webhooks deliver only what happens after the subscription exists, and Zernio
    // has no replay endpoint. So an empty store on day one is not a reading of the
    // customer's inbox — nobody has told us anything yet.
    const d = decideStoreSurface({ ...base, eventsEverReceived: false })
    expect(d.state).toBe('awaiting_first_event')
    expect(d.showList).toBe(false)
    // THE FORBIDDEN CLAIM: a bare statement that they have no conversations.
    expect(`${d.headline} ${d.body}`).not.toMatch(/\bno conversations\b/i)
  })

  it('DOES say empty once events have arrived and none were conversations', () => {
    // The only branch that is a statement about the customer, and it is licensed by
    // evidence: the pipe demonstrably works.
    const d = decideStoreSurface({ ...base, eventsEverReceived: true })
    expect(d.state).toBe('empty')
  })

  it('keeps awaiting_first_event and empty apart — they are different sentences', () => {
    const awaiting = decideStoreSurface({ ...base, eventsEverReceived: false })
    const empty = decideStoreSurface({ ...base, eventsEverReceived: true })
    expect(awaiting.state).not.toBe(empty.state)
    expect(awaiting.body).not.toBe(empty.body)
  })

  it('says never_connected before it says anything about events', () => {
    // A workspace with nothing connected is not "awaiting" anything.
    const d = decideStoreSurface({ ...base, connectedAccounts: 0, eventsEverReceived: false })
    expect(d.state).toBe('never_connected')
  })

  // ── ZERNIO UNREACHABLE ───────────────────────────────────────────────────

  it('STILL SHOWS THE ROWS when the history supplement could not be fetched', () => {
    // The property this whole lane exists for. Zernio being down degrades the page
    // to what the store holds; it does not blank it.
    const d = decideStoreSurface({
      ...base,
      storedRows: 5,
      eventsEverReceived: true,
      historyAvailable: false,
    })
    expect(d.showList).toBe(true)
    expect(d.state).toBe('ok_history_unavailable')
    // And it SAYS what is missing rather than implying the store is the whole truth.
    expect(d.body).toMatch(/older|platform/i)
  })

  it('does not add a history caveat when the supplement was never attempted', () => {
    // `undefined` is "not asked", not "failed". Conflating them would put a warning
    // on every healthy render.
    const d = decideStoreSurface({ ...base, storedRows: 5, eventsEverReceived: true })
    expect(d.state).toBe('ok')
  })

  // ── THE STORE ITSELF FAILING ─────────────────────────────────────────────

  it('a store that could not be read makes NO claim about its contents', () => {
    const d = decideStoreSurface({ ...base, eventsEverReceived: false, storeUnreadable: true })
    expect(d.state).toBe('store_unreadable')
    expect(d.showList).toBe(false)
    expect(`${d.headline} ${d.body}`).not.toMatch(/\bno conversations\b/i)
  })

  it('store_unreadable outranks every other signal', () => {
    // A failed read tells us nothing about connections or events, so no later branch
    // is entitled to run — even one that looks more specific.
    const d = decideStoreSurface({
      ...base,
      connectedAccounts: 0,
      storedRows: 0,
      eventsEverReceived: false,
      storeUnreadable: true,
    })
    expect(d.state).toBe('store_unreadable')
  })

  it('every state is reachable, and no two collapse into one', () => {
    const states = [
      decideStoreSurface({ ...base, storedRows: 1, eventsEverReceived: true }).state,
      decideStoreSurface({
        ...base,
        storedRows: 1,
        eventsEverReceived: true,
        historyAvailable: false,
      }).state,
      decideStoreSurface({ ...base, connectedAccounts: 0, eventsEverReceived: false }).state,
      decideStoreSurface({ ...base, eventsEverReceived: false }).state,
      decideStoreSurface({ ...base, eventsEverReceived: true }).state,
      decideStoreSurface({ ...base, eventsEverReceived: false, storeUnreadable: true }).state,
    ]
    expect(new Set(states).size).toBe(6)
  })
})

describe('the render path cannot be taken down by Zernio', () => {
  it('store-read.ts imports NOTHING that talks to Zernio', () => {
    // THE STRUCTURAL PROOF, and the reason it is structural rather than a mock: a
    // test that stubs a Zernio client proves the stub was not called, not that the
    // code could not call one. This asserts the CAPABILITY IS ABSENT from the module
    // — there is no client here to fail, no timeout to wait on, and no amount of
    // Zernio downtime that can reach this file.
    //
    // The live read still exists in `read.ts` and is still used, as a supplement
    // whose failure is a label. It is simply not on this path.
    const source = readFileSync(resolve(import.meta.dirname, 'store-read.ts'), 'utf8')
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!)

    expect(imports).not.toContain('@/lib/zernio/server')
    expect(imports.filter((i) => /zernio/i.test(i))).toEqual([])
    // And nothing reaches the network by another name.
    expect(source).not.toMatch(/\bfetch\s*\(/)
  })

  it('conversations.ts touches Zernio ONLY through the bounded supplement', () => {
    // THE GUARD WAS POINTED AT THE WRONG FILE. `store-read.ts` importing nothing
    // Zernio-shaped is true and not the claim that matters: the module the PAGE
    // calls is `conversations.ts`, and it does import the live read. What has to be
    // true there is narrower — that the one Zernio-touching call is DEADLINED, so an
    // unreachable host cannot hang a server component.
    //
    // A try/catch is not enough and this asserts the difference: an unreachable host
    // hangs rather than rejecting, and an unbounded await never reaches the catch.
    const source = readFileSync(resolve(import.meta.dirname, 'conversations.ts'), 'utf8')

    // Exactly one call site, and it is inside the raced helper.
    expect(source.match(/readConversations\(/g) ?? []).toHaveLength(1)
    expect(source).toMatch(/Promise\.race\(\[readConversations\(\)/)
    // The deadline is a real number, not an optional argument someone can omit.
    expect(source).toMatch(/SUPPLEMENT_DEADLINE_MS\s*=\s*[\d_]+/)
    // And the timer is always cleared, or a fast answer still holds the invocation
    // open for the whole deadline.
    expect(source).toMatch(/clearTimeout/)
  })

  it('store-decision.ts is pure — no database, no network, no clock', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'store-decision.ts'), 'utf8')
    expect(source).not.toMatch(/\bfetch\s*\(|createServerSupabase|Date\.now/)
  })
})
