import { describe, expect, test } from 'vitest'

import { buildSentryOptions } from './sentry-options'

const DSN = 'https://fakepublickey@o0.ingest.sentry.io/1234567'
const SECRET = 'wsp_secret_AAAAAAAAAAAAAAAA'

// Every input shape the builder can be handed. sendDefaultPii is asserted
// against all of them, because "false by default but true on some branch" is
// exactly the bug that ships headers and IP addresses to a third party.
const ALL_INPUT_SHAPES = [
  ['no dsn at all', {}],
  ['empty dsn', { dsn: '' }],
  ['whitespace dsn', { dsn: '   ' }],
  ['a live dsn', { dsn: DSN }],
  ['a dsn with environment', { dsn: DSN, environment: 'production' }],
  ['a dsn with release', { dsn: DSN, release: 'web@1.2.3' }],
  ['a dsn with secrets', { dsn: DSN, secretValues: [SECRET] }],
  [
    'everything at once',
    { dsn: DSN, environment: 'preview', release: 'web@0.1.0', secretValues: [SECRET] },
  ],
] as const

describe('buildSentryOptions — enablement', () => {
  test('is disabled when no dsn is supplied', () => {
    // A half-initialised SDK is worse than none: it installs global handlers,
    // swallows errors into a transport with nowhere to send them, and hides the
    // fact that reporting is not actually configured.
    const options = buildSentryOptions({})

    expect(options.enabled).toBe(false)
    expect(options.dsn).toBeUndefined()
  })

  test.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('is disabled when the dsn is %s', (_label, dsn) => {
    // An unset var in a .env file reads as '' rather than undefined, so the
    // empty case is the common one, not the exotic one.
    expect(buildSentryOptions({ dsn }).enabled).toBe(false)
  })

  test('is enabled when a dsn is supplied', () => {
    const options = buildSentryOptions({ dsn: DSN })

    expect(options.enabled).toBe(true)
    expect(options.dsn).toBe(DSN)
  })
})

describe('buildSentryOptions — privacy invariants', () => {
  test.each(ALL_INPUT_SHAPES)('sendDefaultPii is exactly false for %s', (_label, input) => {
    // THE most important assertion in this file. `sendDefaultPii: true` is the
    // single flag that attaches request headers, cookies and IP addresses to
    // every event — it defeats the scrubber entirely, because the data is added
    // by the SDK after our hooks run. It is never correct here, for any input.
    const options = buildSentryOptions(input)

    expect(options.sendDefaultPii).toBe(false)
    // toBe(false) and not merely falsy: undefined would let a future SDK
    // default flip the behaviour underneath us.
    expect(options.sendDefaultPii).not.toBeUndefined()
  })

  test.each(ALL_INPUT_SHAPES)('tracesSampleRate is 0 for %s', (_label, input) => {
    // Errors only for now. Tracing spans carry URLs and route params, which is
    // a second PII surface we have not audited and are not paying for yet.
    expect(buildSentryOptions(input).tracesSampleRate).toBe(0)
  })

  test.each(ALL_INPUT_SHAPES)('maxValueLength is bounded for %s', (_label, input) => {
    // The SDK's own truncation, which it does NOT apply by default:
    // prepareEvent truncates only `if (maxValueLength)` and destructures the
    // option with no default, so exception.value and request.url arrive at
    // beforeSend at whatever length they were thrown at. Setting it means the
    // scrubber is handed a bounded string in the first place, upstream of the
    // cap it enforces for itself.
    const options = buildSentryOptions(input)

    expect(options.maxValueLength).toBe(1024)
    // Not merely truthy: `0` and `undefined` both disable truncation entirely,
    // which is the exact default that made the quadratic scan reachable.
    expect(options.maxValueLength).toBeGreaterThan(0)
  })
})

describe('buildSentryOptions — pass-through', () => {
  test('passes environment and release through untouched', () => {
    const options = buildSentryOptions({ dsn: DSN, environment: 'preview', release: 'web@1.2.3' })

    expect(options.environment).toBe('preview')
    expect(options.release).toBe('web@1.2.3')
  })

  test('leaves environment and release undefined when not supplied', () => {
    // Sentry fills its own defaults for these; inventing a value here would
    // mislabel every event from a build that genuinely did not know its release.
    const options = buildSentryOptions({ dsn: DSN })

    expect(options.environment).toBeUndefined()
    expect(options.release).toBeUndefined()
  })
})

describe('buildSentryOptions — beforeSend', () => {
  test('redacts a supplied secret from the event message', () => {
    // Arrange
    const options = buildSentryOptions({ dsn: DSN, secretValues: [SECRET] })
    const event = { message: `request failed with ${SECRET}` }

    // Act
    const sent = options.beforeSend(event) as { message: string } | null

    // Assert
    expect(sent).not.toBeNull()
    expect(sent?.message).not.toContain(SECRET)
  })

  test('redacts nested fields, not just the top-level message', () => {
    const options = buildSentryOptions({ dsn: DSN, secretValues: [SECRET] })
    const event = { extra: { detail: { token: SECRET } } }

    const sent = options.beforeSend(event)

    expect(JSON.stringify(sent)).not.toContain(SECRET)
  })

  test('applies pattern rules even when no secretValues are supplied', () => {
    // The secret list only covers values we knew to register. Anything pulled
    // from a response body is caught by shape or not at all.
    const options = buildSentryOptions({ dsn: DSN })
    const event = { message: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9fakeheaderpayload' }

    const sent = options.beforeSend(event) as { message: string } | null

    expect(sent?.message).not.toContain('eyJhbGciOiJIUzI1NiJ9fakeheaderpayload')
  })

  test('does not mutate the event handed to it', () => {
    const options = buildSentryOptions({ dsn: DSN, secretValues: [SECRET] })
    const event = { message: `failed with ${SECRET}` }
    const before = structuredClone(event)

    options.beforeSend(event)

    expect(event).toEqual(before)
  })

  test('drops the event entirely when disabled', () => {
    // Belt and braces. `enabled: false` should already stop the transport, but
    // if a caller wires beforeSend up by hand, or a future SDK version treats
    // enabled differently, this hook is the last gate before data leaves.
    const options = buildSentryOptions({ secretValues: [SECRET] })

    expect(options.beforeSend({ message: `failed with ${SECRET}` })).toBeNull()
  })
})

describe('buildSentryOptions — beforeBreadcrumb', () => {
  test('redacts a secret carried on a console breadcrumb', () => {
    // Console breadcrumbs are the sneakiest leak: a stray console.log of a
    // request options object rides along with an unrelated crash.
    const options = buildSentryOptions({ dsn: DSN, secretValues: [SECRET] })
    const crumb = { category: 'console', level: 'log', message: `calling with ${SECRET}` }

    const kept = options.beforeBreadcrumb(crumb) as { message: string } | null

    expect(kept).not.toBeNull()
    expect(kept?.message).not.toContain(SECRET)
  })

  test('redacts a secret nested in breadcrumb data', () => {
    const options = buildSentryOptions({ dsn: DSN, secretValues: [SECRET] })
    const crumb = { category: 'fetch', data: { url: `https://api.test/?access_token=${SECRET}` } }

    const kept = options.beforeBreadcrumb(crumb)

    expect(JSON.stringify(kept)).not.toContain(SECRET)
  })

  test('leaves an innocuous breadcrumb intact', () => {
    // Over-redaction destroys the breadcrumb trail, which is the main reason
    // breadcrumbs are worth collecting at all.
    const options = buildSentryOptions({ dsn: DSN, secretValues: [SECRET] })
    const crumb = { category: 'navigation', message: 'Navigated to the composer' }

    expect(options.beforeBreadcrumb(crumb)).toEqual(crumb)
  })

  test('does not mutate the breadcrumb handed to it', () => {
    const options = buildSentryOptions({ dsn: DSN, secretValues: [SECRET] })
    const crumb = { category: 'console', message: `calling with ${SECRET}` }
    const before = structuredClone(crumb)

    options.beforeBreadcrumb(crumb)

    expect(crumb).toEqual(before)
  })

  test('drops the breadcrumb when disabled', () => {
    const options = buildSentryOptions({ secretValues: [SECRET] })

    expect(options.beforeBreadcrumb({ category: 'console', message: 'anything' })).toBeNull()
  })
})
