import { afterEach, describe, expect, it, vi } from 'vitest'

import { fakeSecretMessage } from '@/lib/observability/debug-fixtures'

/**
 * The route's own tests, and the production guard is the reason they exist.
 *
 * This endpoint throws on request by design. In production that is a free DoS
 * lever and a firehose of fake alerts, so a single `NODE_ENV` check is all that
 * stands between a debug tool and an incident — and until now nothing failed if
 * someone moved a `console.log`, a header read or an `await` above it. The guard
 * tests below run every branch under production and assert not just the 404 but
 * that the SDK was never touched, which is what actually catches a statement
 * creeping above the line.
 *
 * The rest pins the honesty of the response body: `configured` and `flushed` are
 * different claims and neither one on its own means an event arrived.
 */

// `vi.mock` factories are hoisted above the imports, so the spies have to be
// created inside `vi.hoisted` — a plain `const` above would be in the temporal
// dead zone by the time the factory runs.
const sentry = vi.hoisted(() => ({
  captureMessage: vi.fn((_message: string, _level: string) => 'event-id-from-sdk'),
  // Typed with the timeout parameter so the assertion that the route passes one
  // is checked by the compiler as well as at runtime.
  flush: vi.fn(async (_timeout?: number) => true),
}))

vi.mock('@sentry/nextjs', () => sentry)

const { GET } = await import('./route')

const ENDPOINT = 'http://localhost:3000/api/debug/sentry'

function requestFor(kind: string | null): Request {
  return new Request(kind === null ? ENDPOINT : `${ENDPOINT}?kind=${kind}`)
}

/** Every branch, including the two that exist to throw. */
const ALL_KINDS: readonly (string | null)[] = [null, 'message', 'secret', 'nonsense']

afterEach(() => {
  vi.unstubAllEnvs()
  sentry.captureMessage.mockClear()
  sentry.flush.mockClear()
  sentry.captureMessage.mockReturnValue('event-id-from-sdk')
  sentry.flush.mockResolvedValue(true)
})

describe('GET /api/debug/sentry — production guard', () => {
  it.each(ALL_KINDS)('returns 404 and never runs the branch for kind=%s in production', async (kind) => {
    // Arrange — a DSN is set, so nothing here is failing for want of config.
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/1')

    // Act — must resolve. A rejection means a throwing branch ran in production.
    const response = await GET(requestFor(kind))

    // Assert
    expect(response.status).toBe(404)
  })

  it('touches no Sentry API at all in production, for any kind', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'production')

    // Act
    for (const kind of ALL_KINDS) {
      await GET(requestFor(kind))
    }

    // Assert — the guard is first, so the SDK is never reached. If a future edit
    // captures or flushes above the guard, this fails.
    expect(sentry.captureMessage).not.toHaveBeenCalled()
    expect(sentry.flush).not.toHaveBeenCalled()
  })

  it('returns an empty body so a scanner learns nothing about the endpoint', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'production')

    // Act
    const response = await GET(requestFor('message'))

    // Assert
    expect(await response.text()).toBe('')
  })
})

describe('GET /api/debug/sentry — branch dispatch', () => {
  it('captures a message and returns the SDK event id for kind=message', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'development')
    sentry.captureMessage.mockReturnValue('abc123')

    // Act
    const response = await GET(requestFor('message'))
    const body = await response.json()

    // Assert
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'sahoda debug: deliberate test message',
      'info',
    )
    expect(body.kind).toBe('message')
    expect(body.eventId).toBe('abc123')
  })

  it('throws the credential-shaped fixture message for kind=secret', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'development')

    // Act / Assert — the thrown text must be the fixture verbatim, because
    // debug-fixtures.test.ts is what proves that text is redactable.
    await expect(GET(requestFor('secret'))).rejects.toThrow(fakeSecretMessage())
  })

  it('throws the deliberate unhandled error when no kind is given', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'development')

    // Act / Assert
    await expect(GET(requestFor(null))).rejects.toThrow(
      'sahoda debug: deliberate unhandled server error',
    )
  })

  it('falls through to the unhandled error for an unrecognised kind', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'development')

    // Act / Assert
    await expect(GET(requestFor('nonsense'))).rejects.toThrow(
      'sahoda debug: deliberate unhandled server error',
    )
  })

  it('does not capture a message on the throwing branches', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'development')

    // Act — the default branch must reach onRequestError uncaptured, or it
    // proves the instrumentation hook works when it does not.
    await expect(GET(requestFor(null))).rejects.toThrow()

    // Assert
    expect(sentry.captureMessage).not.toHaveBeenCalled()
  })
})

describe('GET /api/debug/sentry — flush reporting', () => {
  it('awaits a bounded flush rather than returning before the transport drains', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/1')

    // Act
    await GET(requestFor('message'))

    // Assert — a timeout is required: an unbounded flush hangs the request when
    // the transport is wedged.
    expect(sentry.flush).toHaveBeenCalledTimes(1)
    const [timeout] = sentry.flush.mock.calls[0] ?? []
    expect(timeout).toBeTypeOf('number')
    expect(Number(timeout)).toBeGreaterThan(0)
  })

  it('reports flushed false when the queue did not drain before the timeout', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/1')
    sentry.flush.mockResolvedValue(false)

    // Act
    const body = await (await GET(requestFor('message'))).json()

    // Assert — an event id still comes back, and it still means nothing.
    expect(body.flushed).toBe(false)
    expect(body.configured).toBe(true)
    expect(body.ok).toBe(false)
  })

  it('reports ok only when a DSN is configured and the flush drained', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/1')
    sentry.flush.mockResolvedValue(true)

    // Act
    const body = await (await GET(requestFor('message'))).json()

    // Assert
    expect(body.configured).toBe(true)
    expect(body.flushed).toBe(true)
    expect(body.ok).toBe(true)
  })

  it('never reports ok on a vacuous flush when no DSN is set', async () => {
    // Arrange — THE TRAP. A client with no DSN has no transport, and
    // `client.flush()` returns true immediately in that case, so a bare
    // `flushed` would read as success while nothing was ever sent.
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SENTRY_DSN', '')
    sentry.flush.mockResolvedValue(true)

    // Act
    const body = await (await GET(requestFor('message'))).json()

    // Assert
    expect(body.configured).toBe(false)
    expect(body.ok).toBe(false)
  })

  it('treats a whitespace-only DSN as unconfigured, matching buildSentryOptions', async () => {
    // Arrange — a trailing-space env line is the common typo, and the SDK
    // trims before deciding whether to enable. The report must agree.
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SENTRY_DSN', '   ')

    // Act
    const body = await (await GET(requestFor('message'))).json()

    // Assert
    expect(body.configured).toBe(false)
    expect(body.ok).toBe(false)
  })

  it('never echoes the DSN value into the response body', async () => {
    // Arrange
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SENTRY_DSN', 'https://sup3rs3cret@o0.ingest.sentry.io/1')

    // Act
    const body = await (await GET(requestFor('message'))).text()

    // Assert
    expect(body).not.toContain('sup3rs3cret')
  })
})
