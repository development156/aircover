import { describe, expect, it } from 'vitest'

import { FAKE_API_KEY, FAKE_BEARER, fakeSecretMessage } from './debug-fixtures'
import { REDACTED, redactText } from './scrub'

/**
 * These tests are what stop /api/debug/sentry from degrading into a no-op.
 *
 * The endpoint proves scrubbing works by throwing credential-shaped text and
 * having a human confirm it reads [redacted] in the Sentry UI. That proof is
 * only worth anything if the text it throws is actually the kind of text the
 * scrubber is supposed to catch — so the fixtures are pinned against the real
 * rules here, with NO registered secret values, exactly as the browser sees it.
 */
describe('debug fixtures', () => {
  it('redacts the fake bearer token using shape rules alone', () => {
    // Arrange — no secretValues: this is the pattern layer, unaided.
    const message = FAKE_BEARER

    // Act
    const redacted = redactText(message, [])

    // Assert
    expect(redacted).not.toContain('FAKEFAKEFAKE')
    expect(redacted).not.toContain('NOTAREALSIGNATURE')
    expect(redacted).toContain(REDACTED)
  })

  it('redacts the fake prefixed api key using shape rules alone', () => {
    // Arrange
    const message = FAKE_API_KEY

    // Act
    const redacted = redactText(message, [])

    // Assert
    expect(redacted).not.toContain('FAKE0123456789')
    expect(redacted).toContain(REDACTED)
  })

  it('leaves nothing credential-shaped in the message the endpoint throws', () => {
    // Arrange — the full string, exactly as `?kind=secret` emits it.
    const message = fakeSecretMessage()

    // Act
    const redacted = redactText(message, [])

    // Assert — every distinctive fragment is gone, and the human-readable
    // prefix survives so the event is still identifiable in the Sentry UI.
    expect(redacted).not.toContain('FAKEFAKEFAKE')
    expect(redacted).not.toContain('NOTAREALSIGNATURE')
    expect(redacted).not.toContain('FAKE0123456789')
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(redacted).toContain('boom:')
  })

  it('uses fixtures that are obviously fake, so a leak would harm nothing', () => {
    // Arrange / Act / Assert — pins the intent: if someone swaps in a real
    // credential, this fails loudly instead of shipping the key to Sentry.
    expect(fakeSecretMessage()).toContain('FAKE')
  })
})
