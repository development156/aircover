import type { ZernioInboxMeta } from '@sahoda/publishing'
import { describe, it, expect } from 'vitest'

import { SURFACE_CONNECTION_PLATFORMS, decideSurface } from './surface'

const meta = (over: Partial<ZernioInboxMeta> = {}): ZernioInboxMeta => ({
  accountsQueried: 1,
  accountsFailed: 0,
  failedAccounts: [],
  ...over,
})

describe('SURFACE_CONNECTION_PLATFORMS', () => {
  it('maps reviews to gbp — our column name, not Zernio’s googlebusiness', () => {
    expect(SURFACE_CONNECTION_PLATFORMS.reviews).toEqual(['gbp'])
  })

  it('claims no platform the connections CHECK could never hold', () => {
    // Every value must be one upsert_zernio_connection accepts, or one the migration
    // widening the CHECK will accept. A typo here matches zero rows forever and turns
    // accountsQueried into a vacuous 0 that the UI would report as a measurement.
    const admissible = new Set(['instagram', 'x', 'gbp', 'linkedin', 'facebook', 'whatsapp'])
    for (const platforms of Object.values(SURFACE_CONNECTION_PLATFORMS)) {
      for (const p of platforms) expect(admissible).toContain(p)
    }
  })

  it('keeps reviews to Google alone — no other platform serves reviews', () => {
    expect(SURFACE_CONNECTION_PLATFORMS.reviews).toHaveLength(1)
  })
})

describe('decideSurface — the three ways a read produces no answer', () => {
  it('no_profile is never_connected: there is nothing to address a read to', () => {
    const d = decideSurface({ surface: 'reviews', connectedAccounts: 0, failure: 'no_profile' })
    expect(d.state.state).toBe('never_connected')
    expect(d.showList).toBe(false)
  })

  it('no_reader is not_read — our missing key, not the customer’s missing account', () => {
    const d = decideSurface({ surface: 'reviews', connectedAccounts: 0, failure: 'no_reader' })
    expect(d.state.state).toBe('not_read')
  })

  it('call_failed is could_not_ask, never empty', () => {
    const d = decideSurface({
      surface: 'conversations',
      connectedAccounts: 2,
      failure: 'call_failed',
    })
    expect(d.state.state).toBe('could_not_ask')
  })

  it('gives the three failures three different states', () => {
    const states = (['no_profile', 'no_reader', 'call_failed'] as const).map(
      (failure) =>
        decideSurface({ surface: 'comments', connectedAccounts: 1, failure }).state.state,
    )
    expect(new Set(states).size).toBe(3)
  })

  it('never renders a list on any failure', () => {
    for (const failure of ['no_profile', 'no_reader', 'call_failed'] as const) {
      expect(decideSurface({ surface: 'comments', connectedAccounts: 1, failure }).showList).toBe(
        false,
      )
    }
  })
})

describe('decideSurface — with an answer', () => {
  it('shows the list when rows arrived', () => {
    const d = decideSurface({
      surface: 'conversations',
      connectedAccounts: 1,
      result: { rows: 4, meta: meta() },
    })
    expect(d.state.state).toBe('ok')
    expect(d.showList).toBe(true)
  })

  it('reports a real empty as empty — the one case that earns "none yet"', () => {
    const d = decideSurface({
      surface: 'conversations',
      connectedAccounts: 1,
      result: { rows: 0, meta: meta() },
    })
    expect(d.state.state).toBe('empty')
  })

  it('reports our-count-1 against Zernio-queried-0 as unresolved, not empty', () => {
    const d = decideSurface({
      surface: 'reviews',
      connectedAccounts: 1,
      result: { rows: 0, meta: meta({ accountsQueried: 0 }) },
    })
    expect(d.state.state).toBe('unresolved')
  })

  it('is never_connected for GBP when nothing is connected and Zernio agrees', () => {
    const d = decideSurface({
      surface: 'reviews',
      connectedAccounts: 0,
      result: { rows: 0, meta: meta({ accountsQueried: 0 }) },
    })
    expect(d.state.state).toBe('never_connected')
    expect(`${d.state.headline} ${d.state.body}`).toMatch(/Google Business Profile/)
    expect(`${d.state.headline} ${d.state.body}`).not.toMatch(/\bno reviews\b/i)
  })

  it('does not report "empty" when neither a result nor a failure was supplied', () => {
    const d = decideSurface({ surface: 'reviews', connectedAccounts: 1 })
    expect(d.state.state).toBe('unknown')
    expect(d.showList).toBe(false)
  })
})
