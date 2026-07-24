import { describe, expect, it } from 'vitest'

import { deliveryVerdict } from './delivery-verdict'

/**
 * The whole truth table, because the interesting cases are the two where the
 * naive reading is wrong:
 *
 *  - configured false + flushed true is NOT success. A client with no DSN has no
 *    transport, and `client.flush()` returns true immediately when there is no
 *    transport to drain (verified in @sentry/core 10.66.0, client.js: `if
 *    (!transport) return true`). Reporting that as delivered is exactly the
 *    old `sent: Boolean(SENTRY_DSN)` bug wearing a new name.
 *
 *  - configured true + flushed true is not proof of ARRIVAL either, only of
 *    departure. `drain()` is `Promise.allSettled(...).then(() => true)`, so a
 *    403 from a revoked key settles and drains just like a 200. The verdict
 *    wording has to stop short of claiming Sentry accepted the envelope.
 */
describe('deliveryVerdict', () => {
  it('reports ok when a DSN is configured and the queue drained', () => {
    // Arrange / Act
    const verdict = deliveryVerdict({ configured: true, flushed: true })

    // Assert
    expect(verdict.ok).toBe(true)
    expect(verdict.verdict).toBe('drained')
  })

  it('reports not ok when the queue did not drain before the timeout', () => {
    // Arrange / Act
    const verdict = deliveryVerdict({ configured: true, flushed: false })

    // Assert
    expect(verdict.ok).toBe(false)
    expect(verdict.verdict).toBe('not-drained')
  })

  it('reports not configured, not success, when the DSN is unset but flush returned true', () => {
    // Arrange / Act — the vacuous-true trap.
    const verdict = deliveryVerdict({ configured: false, flushed: true })

    // Assert
    expect(verdict.ok).toBe(false)
    expect(verdict.verdict).toBe('not-configured')
  })

  it('reports not configured when neither a DSN nor a drain happened', () => {
    // Arrange / Act
    const verdict = deliveryVerdict({ configured: false, flushed: false })

    // Assert
    expect(verdict.ok).toBe(false)
    expect(verdict.verdict).toBe('not-configured')
  })

  it('never claims the event arrived, only that it left', () => {
    // Arrange / Act — a 403 drains identically to a 202, so the success note
    // must not assert acceptance by Sentry.
    const note = deliveryVerdict({ configured: true, flushed: true }).note

    // Assert
    expect(note).not.toMatch(/arrived|accepted|received/i)
  })

  it('tells the reader to confirm in the Sentry UI on the success path', () => {
    // Arrange / Act
    const note = deliveryVerdict({ configured: true, flushed: true }).note

    // Assert — departure is the strongest local claim; the UI closes the loop.
    expect(note).toMatch(/sentry/i)
  })
})
