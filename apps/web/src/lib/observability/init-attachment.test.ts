import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Proves the scrubber is ACTUALLY ATTACHED to every `Sentry.init` call.
 *
 * WHY THIS FILE EXISTS — every other test here verifies a collaborator in
 * isolation. `sentry-init-options.test.ts` proves the adapter returns a working
 * `beforeSend`; `scrub.test.ts` proves the rules redact. Neither proves any of
 * it is ever handed to the SDK. That gap was not theoretical: dropping
 * `toSentryInitOptions(...)` from sentry.server.config.ts for a bare
 * `{ dsn: process.env.SENTRY_DSN }` left the suite green, typecheck clean and
 * the build passing while scrubbing died and secrets shipped to a third party.
 *
 * So these tests import the three real init modules with `@sentry/nextjs` mocked
 * and inspect the options `init` actually received — end-of-chain by design, not
 * how they were assembled. The assertion that matters is not "beforeSend is a
 * function" (a stub satisfies that) but "feeding it a secret returns it redacted".
 */

/**
 * `vi.hoisted` rather than a plain const, load-bearing twice over: `vi.mock` is
 * hoisted above the imports so its factory cannot close over an ordinary
 * module-scope binding, and `vi.resetModules()` can re-run that factory — a spy
 * minted inside it would be replaced on reset, leaving every captured reference
 * reading zero calls off an object nobody is calling.
 */
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  // The client entry re-exports this under the name Next requires. Provided so
  // the module under test evaluates the way it does in a real bundle.
  captureRouterTransitionStart: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => sentry)

/**
 * The truncation cap `buildSentryOptions` sets, restated here on purpose.
 *
 * These tests assert on what the SDK RECEIVED, so importing the builder's
 * constant would let a change to it drag the expectation along and keep the test
 * green — which is the one thing an end-of-chain test must not do. The number is
 * duplicated so that changing the policy has to be argued for twice.
 */
const MAX_VALUE_LENGTH = 1024

/** Syntactically valid but entirely fake — no event can reach a real project. */
const SERVER_DSN = 'https://serverpublickey@o0.ingest.sentry.io/1'
const CLIENT_DSN = 'https://clientpublickey@o0.ingest.sentry.io/2'
const REDACTED = '[redacted]'

/**
 * Caught by shape rather than registration, so one value proves redaction on all
 * three runtimes — including the browser, which registers no secrets at all.
 */
const SHAPED_SECRET = 'founder@sahodalabs.com'

/**
 * Deliberately shapeless: no `sk-` prefix, no `eyJ`, no `@`, nothing any pattern
 * rule can recognise. The ONLY way this gets redacted is if the init module read
 * it out of `process.env` and registered it as an exact value — the wiring these
 * tests exist to pin.
 */
const REGISTERED_SECRET = 'clerk-backend-value-0000-1111-2222'

/** The subset of the SDK's option bag these tests make claims about. */
interface CapturedInitOptions {
  readonly enabled?: unknown
  readonly dsn?: unknown
  readonly sendDefaultPii?: unknown
  readonly tracesSampleRate?: unknown
  readonly maxValueLength?: unknown
  readonly beforeSend?: (event: Record<string, unknown>) => unknown
  readonly beforeBreadcrumb?: (breadcrumb: Record<string, unknown>) => unknown
}

interface InitPath {
  readonly name: string
  /** The env var this runtime reads its DSN from — server and browser differ. */
  readonly dsnVar: 'SENTRY_DSN' | 'NEXT_PUBLIC_SENTRY_DSN'
  readonly dsn: string
  readonly load: () => Promise<unknown>
}

/**
 * The three entry points, as one table — deliberately table-driven rather than
 * three hand-written blocks. These files are near-twins whose whole risk is
 * DRIFT, so a shared table makes adding a fourth runtime a one-line change that
 * inherits every invariant instead of an opportunity to forget one.
 *
 * The specifiers stay literal inside each arrow so the resolver can see them.
 */
const SERVER_PATH: InitPath = {
  name: 'sentry.server.config.ts (node runtime)',
  dsnVar: 'SENTRY_DSN',
  dsn: SERVER_DSN,
  load: () => import('@/sentry.server.config'),
}

const EDGE_PATH: InitPath = {
  name: 'sentry.edge.config.ts (edge runtime)',
  dsnVar: 'SENTRY_DSN',
  dsn: SERVER_DSN,
  load: () => import('@/sentry.edge.config'),
}

const CLIENT_PATH: InitPath = {
  name: 'instrumentation-client.ts (browser)',
  dsnVar: 'NEXT_PUBLIC_SENTRY_DSN',
  dsn: CLIENT_DSN,
  load: () => import('@/instrumentation-client'),
}

const INIT_PATHS: readonly InitPath[] = [SERVER_PATH, EDGE_PATH, CLIENT_PATH]

/** Every env var these tests write, so each can be put back afterwards. */
const TOUCHED_ENV_VARS = ['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN', 'CLERK_SECRET_KEY'] as const
const envBackup = new Map<string, string | undefined>()

/**
 * Run one of the attached hooks and serialise what it returned.
 *
 * THROWS when the hook is missing, which is the whole reason this exists rather
 * than an inline `JSON.stringify(options.beforeSend?.(…))`.
 * `JSON.stringify(undefined)` is `undefined`, and
 * `expect(undefined).not.toContain(secret)` PASSES — so an unattached scrubber
 * would satisfy every negative assertion in this file and the suite would go
 * green on the exact regression it was written to catch. A test that cannot fail
 * is worse than no test, so a missing hook has to be a loud error.
 */
function scrubbedBy(
  hook: ((event: Record<string, unknown>) => unknown) | undefined,
  hookName: string,
  event: Record<string, unknown>,
): string {
  if (typeof hook !== 'function') {
    throw new Error(`Sentry.init received no ${hookName} — nothing is scrubbing events`)
  }
  return JSON.stringify(hook(event)) ?? 'undefined'
}

/**
 * Import an init module fresh and hand back the options `Sentry.init` received.
 *
 * `resetModules` is what makes this repeatable: these modules call `init` as a
 * module-scope side effect, so without it the second test would import a cached
 * module, observe no new call, and assert against stale data.
 *
 * The DSN is set BEFORE the import because the module reads `process.env` while
 * evaluating, and it has to be non-empty: `buildSentryOptions` treats a missing
 * DSN as "disabled" and makes `beforeSend` return null for everything, which
 * would let a genuinely unattached scrubber masquerade as a working one.
 *
 * NOTE ON THE BROWSER PATH: `instrumentation-client.ts` references
 * `process.env.NEXT_PUBLIC_SENTRY_DSN` in its literal form because the Next
 * build-time inliner substitutes that exact token. There is no inliner under
 * vitest, so the token stays an ordinary runtime property read and a plain
 * assignment reaches it. Confirmed by running it, not assumed.
 */
async function captureInitOptions(path: InitPath): Promise<CapturedInitOptions> {
  vi.resetModules()
  sentry.init.mockClear()
  process.env[path.dsnVar] = path.dsn

  await path.load()

  return sentry.init.mock.calls[0]?.[0] as CapturedInitOptions
}

beforeEach(() => {
  for (const name of TOUCHED_ENV_VARS) envBackup.set(name, process.env[name])
})

afterEach(() => {
  // Restored rather than deleted: this runner is shared with every other suite,
  // and a leaked fake DSN would quietly change what they are testing.
  for (const [name, value] of envBackup) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  envBackup.clear()
})

describe.each(INIT_PATHS)('Sentry.init attachment in $name', (path) => {
  it('calls Sentry.init exactly once, with the DSN from its own env var', async () => {
    // Arrange / Act
    const options = await captureInitOptions(path)

    // Assert — once, because a second init silently replaces the first client
    // and whichever options lost the race stop applying.
    expect(sentry.init).toHaveBeenCalledTimes(1)
    expect(options.enabled).toBe(true)
    expect(options.dsn).toBe(path.dsn)
  })

  it('never enables sendDefaultPii', async () => {
    // Arrange / Act
    const options = await captureInitOptions(path)

    // Assert — the SDK attaches headers, cookies and IP AFTER beforeSend runs,
    // so this flag is the only defence against them; the scrubber never sees them.
    expect(options.sendDefaultPii).toBe(false)
  })

  it('attaches a beforeSend that actually redacts a secret in an event', async () => {
    // Arrange
    const options = await captureInitOptions(path)

    // Act — an ordinary event shape, with a credential buried where one really
    // ends up: inside the text of an exception message.
    const serialised = scrubbedBy(options.beforeSend, 'beforeSend', {
      event_id: 'abc123',
      message: `request failed for ${SHAPED_SECRET}`,
    })

    // Assert — that the hook EXISTS is not the claim worth making; that the
    // secret does not survive it is.
    expect(serialised).not.toContain(SHAPED_SECRET)
    expect(serialised).toContain(REDACTED)
    // Still a usable bug report on the other side.
    expect(JSON.parse(serialised)).toMatchObject({ event_id: 'abc123' })
  })

  it('attaches a beforeBreadcrumb that actually redacts a secret in a breadcrumb', async () => {
    // Arrange — breadcrumbs are the easier half to forget and the leakier one:
    // there are hundreds per event and they quote URLs and request bodies.
    const options = await captureInitOptions(path)

    // Act
    const serialised = scrubbedBy(options.beforeBreadcrumb, 'beforeBreadcrumb', {
      category: 'fetch',
      message: `GET /api/x for ${SHAPED_SECRET}`,
    })

    // Assert
    expect(serialised).not.toContain(SHAPED_SECRET)
    expect(serialised).toContain(REDACTED)
  })

  it('caps event value length, so the scrubber never sees an unbounded string', async () => {
    // Arrange / Act
    const options = await captureInitOptions(path)

    // Assert — the third ReDoS defence, and the only one that acts BEFORE our
    // regexes: the SDK truncates in `prepareEvent`, upstream of `beforeSend`.
    // Asserted here rather than only on the adapter because the adapter lists its
    // output fields by hand, and this field spent its entire life being built,
    // unit-tested and then quietly dropped on the way to `init` — proof that the
    // builder set it was never proof that Sentry was told.
    expect(options.maxValueLength).toBe(MAX_VALUE_LENGTH)
  })

  it('samples no traces', async () => {
    // Arrange / Act
    const options = await captureInitOptions(path)

    // Assert — spans carry full URLs and route params, an unaudited PII surface.
    // Zero is a decision; raising it is a policy change that must argue here first.
    expect(options.tracesSampleRate).toBe(0)
  })
})

/**
 * The server-only half of the wiring: the exact-value registry. Shape rules
 * cannot see a credential whose format we cannot predict, so a decrypted OAuth
 * token or a rotated Clerk key is covered only if the init module pulled it out
 * of `process.env` and registered it — a separate wire from the scrubber itself,
 * and one that can be cut on its own.
 */
describe.each(INIT_PATHS.filter((path) => path.dsnVar === 'SENTRY_DSN'))(
  'registered secret values in $name',
  (path) => {
    it('redacts a secret env var by exact value, not by shape', async () => {
      // Arrange — shapeless, so no pattern rule can rescue this. Set before the
      // import, because secretValuesFrom(process.env) runs at module scope.
      process.env.CLERK_SECRET_KEY = REGISTERED_SECRET
      const options = await captureInitOptions(path)

      // Act
      const serialised = scrubbedBy(options.beforeSend, 'beforeSend', {
        message: `connect failed: ${REGISTERED_SECRET}`,
      })

      // Assert
      expect(serialised).not.toContain(REGISTERED_SECRET)
      expect(serialised).toContain(REDACTED)
    })
  },
)

describe('instrumentation-client.ts browser-specific wiring', () => {
  it('registers no secret env values, so none can be inlined into the public bundle', async () => {
    // Arrange — the client bundle is served to anyone. Every value passed as a
    // secret to redact would be written into that JavaScript file, so
    // "registering" CLERK_SECRET_KEY here would PUBLISH it. This test fails the
    // day someone copies the server config's secretValues line across in the
    // name of removing duplication.
    process.env.CLERK_SECRET_KEY = REGISTERED_SECRET
    const options = await captureInitOptions(CLIENT_PATH)

    // Act
    const serialised = scrubbedBy(options.beforeSend, 'beforeSend', {
      message: `connect failed: ${REGISTERED_SECRET}`,
    })

    // Assert — untouched, because the browser was never told about it. The
    // browser's protection is the shape rules, proved above.
    expect(serialised).toContain(REGISTERED_SECRET)
  })

  it('exports onRouterTransitionStart under the name Next requires', async () => {
    // Arrange — Next looks up this exact export name, while the SDK's
    // implementation is called captureRouterTransitionStart, so the rename IS
    // the wiring. Omit it and Next warns at build time and records no
    // navigations. Loads through the same helper, so the module is already fresh.
    await captureInitOptions(CLIENT_PATH)

    // Act
    const clientEntry = await import('@/instrumentation-client')

    // Assert
    expect(clientEntry.onRouterTransitionStart).toBe(sentry.captureRouterTransitionStart)
  })
})
