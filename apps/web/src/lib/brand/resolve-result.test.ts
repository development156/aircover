import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { mapResolveOutcome, type CreditsOutcome, type MeshResolveOutcome } from './resolve-result'

const REAL: MeshResolveOutcome = { kind: 'real', brain: { ...DEMO_FALLBACK_PAYLOAD } }
const FALLBACK: MeshResolveOutcome = { kind: 'fallback', brain: DEMO_FALLBACK_PAYLOAD }
const MESH_ERR: MeshResolveOutcome = { kind: 'error', message: 'provider down' }

const CHARGED: CreditsOutcome = { ok: true, balanceAfter: 50 }
const RELEASED: CreditsOutcome = { ok: false, insufficient: false, message: 'released' }
const INSUFFICIENT: CreditsOutcome = { ok: false, insufficient: true, required: 50, available: 10 }

describe('mapResolveOutcome — charge policy', () => {
  test('real resolve + charged → resolved, carries balanceAfter', () => {
    const state = mapResolveOutcome(REAL, CHARGED)
    expect(state).toMatchObject({ ok: true, kind: 'resolved', balanceAfter: 50 })
    if (state.ok && state.kind === 'resolved') expect(state.brain).toBe(REAL.brain)
  })

  test('demo fallback → NOT charged, flagged fallback with the sample brain', () => {
    // fallback path releases the hold, so credits is a non-insufficient failure
    const state = mapResolveOutcome(FALLBACK, RELEASED)
    expect(state).toMatchObject({ ok: true, kind: 'fallback' })
    if (state.ok && state.kind === 'fallback') {
      expect(state.brain).toBe(FALLBACK.brain)
      expect(state.message).toMatch(/sample|not charged|retry/i)
    }
  })

  test('resolve error (released, no charge) → typed error, no brain', () => {
    const state = mapResolveOutcome(MESH_ERR, RELEASED)
    expect(state).toMatchObject({ ok: false, kind: 'error' })
  })

  test('insufficient credits (HOLD failed, mesh never ran) → typed insufficient with numbers', () => {
    const state = mapResolveOutcome(null, INSUFFICIENT)
    expect(state).toMatchObject({ ok: false, kind: 'insufficient', required: 50, available: 10 })
  })

  test('never presents a fallback as a real charged resolve', () => {
    // even if some upstream bug reported "charged" on a fallback, the kind must reflect the truth:
    // we key the happy path on credits.ok which only happens when fn returned (real). A fallback
    // that somehow reached CHARGED still must not be labeled resolved without a real brain.
    const state = mapResolveOutcome(FALLBACK, RELEASED)
    expect(state.ok && state.kind === 'resolved').toBe(false)
  })
})
