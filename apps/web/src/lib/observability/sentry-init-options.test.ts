import { describe, expect, it } from 'vitest'

import { toSentryInitOptions } from './sentry-init-options'
import { buildSentryOptions } from './sentry-options'

const DSN = 'https://publickey@o0.ingest.sentry.io/1'

describe('toSentryInitOptions', () => {
  it('carries every option through to the SDK unchanged', () => {
    // Arrange
    const options = buildSentryOptions({ dsn: DSN, environment: 'test', release: 'abc123' })

    // Act
    const initOptions = toSentryInitOptions(options)

    // Assert
    expect(initOptions.enabled).toBe(true)
    expect(initOptions.dsn).toBe(DSN)
    expect(initOptions.environment).toBe('test')
    expect(initOptions.release).toBe('abc123')
    expect(initOptions.tracesSampleRate).toBe(0)
  })

  it('carries maxValueLength through, so the SDK truncates before our regexes run', () => {
    // Arrange — this adapter enumerates fields by hand, so a field the builder
    // sets and the adapter forgets is dropped in total silence: the builder's own
    // tests still pass, typecheck still passes, and the defence is simply gone.
    // maxValueLength was in exactly that state.
    const options = buildSentryOptions({ dsn: DSN })

    // Act
    const initOptions = toSentryInitOptions(options)

    // Assert — not merely "defined". The SDK's `prepareEvent` truncates only
    // `if (maxValueLength)`, so 0 or undefined both mean "never truncate" and
    // both would sail past a looser assertion while the guard did nothing.
    expect(initOptions.maxValueLength).toBe(options.maxValueLength)
    expect(initOptions.maxValueLength).toBeGreaterThan(0)
  })

  it('never lets sendDefaultPii through as true', () => {
    // Arrange — the invariant worth a test of its own: PII is attached by the
    // SDK after beforeSend runs, so the scrubber cannot defend against it.
    const options = buildSentryOptions({ dsn: DSN })

    // Act
    const initOptions = toSentryInitOptions(options)

    // Assert
    expect(initOptions.sendDefaultPii).toBe(false)
  })

  it('routes events through the scrubber before they reach the transport', () => {
    // Arrange
    const options = buildSentryOptions({ dsn: DSN, secretValues: ['super-secret-token-value'] })
    const initOptions = toSentryInitOptions(options)

    // Act — the cast mirrors the one inside the adapter; Sentry hands it a real
    // ErrorEvent, and the point of this test is that the hook is still wired.
    const scrubbed = initOptions.beforeSend({
      message: 'failed with super-secret-token-value',
    } as never)

    // Assert
    expect(JSON.stringify(scrubbed)).not.toContain('super-secret-token-value')
    expect(JSON.stringify(scrubbed)).toContain('[redacted]')
  })

  it('routes breadcrumbs through the scrubber too', () => {
    // Arrange
    const options = buildSentryOptions({ dsn: DSN, secretValues: ['super-secret-token-value'] })
    const initOptions = toSentryInitOptions(options)

    // Act
    const scrubbed = initOptions.beforeBreadcrumb({
      message: 'sent super-secret-token-value',
    } as never)

    // Assert
    expect(JSON.stringify(scrubbed)).not.toContain('super-secret-token-value')
  })

  it('drops events entirely when Sentry is disabled', () => {
    // Arrange — no DSN, so nothing should ever be handed to a transport.
    const options = buildSentryOptions({ dsn: undefined })
    const initOptions = toSentryInitOptions(options)

    // Act
    const result = initOptions.beforeSend({ message: 'anything' } as never)

    // Assert
    expect(result).toBeNull()
    expect(initOptions.enabled).toBe(false)
    expect(initOptions.dsn).toBeUndefined()
  })

  it('preserves the ordinary fields Sentry needs to render an event', () => {
    // Arrange — scrubbing must not be so aggressive that the report is useless.
    const options = buildSentryOptions({ dsn: DSN })
    const initOptions = toSentryInitOptions(options)

    // Act
    const scrubbed = initOptions.beforeSend({
      event_id: 'abc123',
      message: 'ordinary failure with no credentials in it',
    } as never)

    // Assert
    expect(scrubbed).toMatchObject({
      event_id: 'abc123',
      message: 'ordinary failure with no credentials in it',
    })
  })
})
