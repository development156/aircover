import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `reportServerError` is the only way a CAUGHT error reaches Sentry.
 *
 * Every server action in this app wraps its body in a try/catch and converts the
 * throw into a Result envelope — a Supabase outage, a mesh timeout and a lost
 * credit ack all arrive at the user as calm prose. That is correct for the user
 * and catastrophic for us: `onRequestError` fires only on errors that escape the
 * request, so a handled error is, by construction, invisible. This helper is the
 * seam that makes it visible, which is why its contract is pinned rather than
 * assumed.
 *
 * The load-bearing property is the LAST one: this runs on a user path, inside a
 * catch block, and a throw from here would convert a handled failure into an
 * unhandled 500. Reporting must never be able to make an outage worse.
 */

const sentry = vi.hoisted(() => ({
  captureException: vi.fn<(error: unknown, context?: unknown) => string>(() => 'event_id'),
  flush: vi.fn<(timeout?: number) => Promise<boolean>>(async () => true),
}))

vi.mock('@sentry/nextjs', () => ({
  // Indirected through the hoisted spy so a test can swap the behaviour
  // (throwing, uninitialised) without re-mocking the module.
  captureException: (error: unknown, context?: unknown) => sentry.captureException(error, context),
  flush: (timeout?: number) => sentry.flush(timeout),
}))

/**
 * `after` is RECORDED, not run.
 *
 * The real one defers its callback until the response has been sent — so a mock
 * that invoked it inline would be testing a timing this code specifically does
 * not have, and would hide the difference between "scheduled the flush" and
 * "flushed on the user's critical path". Tests that care about what the callback
 * does run it explicitly via `runScheduledTask`.
 */
const nextServer = vi.hoisted(() => ({
  after: vi.fn<(task: () => unknown) => void>(),
}))

vi.mock('next/server', () => ({
  after: (task: () => unknown) => nextServer.after(task),
}))

const { reportServerError } = await import('./report')

/** The `{ tags }` capture context the helper is expected to pass. */
function tagsOf(call: [unknown, unknown?] | undefined): Record<string, unknown> {
  const context = call?.[1] as { tags?: Record<string, unknown> } | undefined
  return context?.tags ?? {}
}

const WS_ID = '22222222-2222-4222-8222-222222222222'

/**
 * Run whatever was handed to `after`, the way the platform would once the
 * response is out. Throws when nothing was scheduled — a silent no-op here would
 * let every assertion about flushing pass against code that never flushes.
 */
async function runScheduledTask(): Promise<void> {
  const task = nextServer.after.mock.calls[0]?.[0]
  if (typeof task !== 'function') {
    throw new Error('nothing was scheduled with after() — the flush is not wired')
  }
  await task()
}

describe('reportServerError', () => {
  beforeEach(() => {
    sentry.captureException.mockReset()
    sentry.captureException.mockReturnValue('event_id')
    sentry.flush.mockReset()
    sentry.flush.mockResolvedValue(true)
    nextServer.after.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('sends the caught error to Sentry', () => {
    // Arrange
    const error = new Error('supabase unreachable')

    // Act
    reportServerError(error, { action: 'savePost' })

    // Assert — the error object itself, not a stringified copy: Sentry groups on
    // the stack, and a re-wrapped error loses the frame that names the failure.
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(error)
  })

  test('reports non-Error throws unchanged rather than dropping them', () => {
    // Arrange — a rejected string is a real shape in this codebase; PostgREST and
    // fetch layers both throw non-Errors, and dropping them would hide outages.
    const thrown = 'PGRST301'

    // Act
    reportServerError(thrown, { action: 'deletePost' })

    // Assert
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(thrown)
  })

  test('tags the event with the action name so events group per action', () => {
    // Arrange / Act
    reportServerError(new Error('boom'), { action: 'generateVariants' })

    // Assert — a tag, not extra data: tags are indexed and facetable, so "which
    // action is failing" is answerable in the Sentry UI without opening events.
    expect(tagsOf(sentry.captureException.mock.calls[0])).toMatchObject({
      action: 'generateVariants',
    })
  })

  test('tags the event with workspace_id when the action already knows it', () => {
    // Arrange / Act
    reportServerError(new Error('boom'), { action: 'planMyWeek', workspaceId: WS_ID })

    // Assert — workspace_id is a TENANT identifier, not personal data, and it is
    // the single most useful correlation key here: it turns "some errors" into
    // "this customer is down".
    expect(tagsOf(sentry.captureException.mock.calls[0])).toMatchObject({
      action: 'planMyWeek',
      workspace_id: WS_ID,
    })
  })

  test('omits the workspace tag entirely when no workspace is in scope', () => {
    // Arrange / Act — an auth failure happens before any workspace is resolved.
    reportServerError(new Error('boom'), { action: 'createPost' })

    // Assert — absent, not 'undefined' or '': an empty-string tag is a real tag
    // value in Sentry and would pollute the facet with a meaningless bucket.
    expect(tagsOf(sentry.captureException.mock.calls[0])).not.toHaveProperty('workspace_id')
  })

  test('attaches no identity beyond the workspace', () => {
    // Arrange / Act
    reportServerError(new Error('boom'), { action: 'savePost', workspaceId: WS_ID })

    // Assert — the tag set is CLOSED. A future edit that starts attaching a user
    // email or name fails here, which is the point: this helper runs on every
    // failure path in the app and is the easiest place to leak PII by accident.
    expect(Object.keys(tagsOf(sentry.captureException.mock.calls[0])).sort()).toEqual([
      'action',
      'workspace_id',
    ])
  })

  test('does not throw when Sentry itself throws', () => {
    // Arrange — a broken transport, a bad DSN, an SDK bug. Whatever the cause,
    // this is the scenario that must not escalate: we are inside a catch block on
    // a user path, and a throw from here turns a handled error into a 500.
    sentry.captureException.mockImplementation(() => {
      throw new Error('sentry transport exploded')
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act / Assert
    expect(() => reportServerError(new Error('boom'), { action: 'savePost' })).not.toThrow()

    // The failure is not swallowed in silence — the local log is the only channel
    // left once the remote one is the thing that broke.
    expect(logged).toHaveBeenCalled()
  })

  test('schedules a flush after the response, rather than blocking on one', async () => {
    // Arrange / Act — captureException only QUEUES the event. On a serverless
    // platform the invocation can be frozen the moment the response returns,
    // taking the queue with it, so without this the whole feature can report
    // nothing in production while looking correctly wired everywhere else.
    reportServerError(new Error('boom'), { action: 'savePost' })

    // Assert — deferred, not awaited: nothing has flushed yet at this point,
    // which is what keeps the network round-trip off the user's critical path.
    expect(nextServer.after).toHaveBeenCalledTimes(1)
    expect(sentry.flush).not.toHaveBeenCalled()

    // ...and it really does flush once the platform runs the scheduled work.
    await runScheduledTask()
    expect(sentry.flush).toHaveBeenCalledTimes(1)
  })

  test('bounds the flush with a timeout so an unreachable Sentry cannot hang the invocation', async () => {
    // Arrange / Act
    reportServerError(new Error('boom'), { action: 'savePost' })
    await runScheduledTask()

    // Assert — flush resolves early when the queue drains, so this is a ceiling
    // and not a per-error cost. Unbounded, a Sentry outage would keep every
    // invocation alive until the platform killed it, converting someone else's
    // outage into our compute bill.
    const timeout = sentry.flush.mock.calls[0]?.[0]
    expect(typeof timeout).toBe('number')
    expect(timeout).toBeGreaterThan(0)
  })

  test('captures first and schedules the flush second', () => {
    // Arrange / Act
    reportServerError(new Error('boom'), { action: 'savePost' })

    // Assert — the ordering is load-bearing. If after() were called first and
    // threw, it would land in the outer catch and the capture would never run:
    // a delivery optimisation would have cost us the very event it exists to
    // protect. Pinned directly so a refactor cannot quietly swap the two.
    expect(Math.min(...sentry.captureException.mock.invocationCallOrder)).toBeLessThan(
      Math.min(...nextServer.after.mock.invocationCallOrder),
    )
  })

  test('still captures, and still does not throw, when called outside a request scope', () => {
    // Arrange — the real `after` throws E468 when there is no request scope:
    // a background job, a script, a test. This helper is documented as safe to
    // call from anywhere, so that must degrade rather than escalate.
    nextServer.after.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope.')
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('boom')

    // Act / Assert
    expect(() => reportServerError(error, { action: 'savePost' })).not.toThrow()

    // The event still reached Sentry — losing the early flush is acceptable,
    // losing the report is not. Outside a request scope there is no freeze to
    // race anyway, so the transport drains on its own.
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(sentry.captureException.mock.calls[0]?.[0]).toBe(error)

    // And it stays QUIET. This path is working correctly, not failing; logging
    // it would print an error for every handled error in every non-request
    // context and train everyone to ignore this file's output.
    expect(logged).not.toHaveBeenCalled()
  })

  test('does not throw when the flush itself rejects', async () => {
    // Arrange — a dead transport or a DSN pointing nowhere. This runs after the
    // response, but an unhandled rejection here would still surface as a crashed
    // task on the platform.
    sentry.flush.mockRejectedValue(new Error('transport gone'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act
    reportServerError(new Error('boom'), { action: 'savePost' })

    // Assert — safe to log at this point (the user is not waiting on it), but
    // never safe to throw.
    await expect(runScheduledTask()).resolves.toBeUndefined()
    expect(logged).toHaveBeenCalled()
  })

  test('does not schedule a flush for an event that was never captured', () => {
    // Arrange — capture blew up, so there is nothing queued to push out.
    sentry.captureException.mockImplementation(() => {
      throw new Error('sentry transport exploded')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act
    reportServerError(new Error('boom'), { action: 'savePost' })

    // Assert — scheduling work to flush an empty queue would buy nothing and
    // keep a serverless invocation alive to do it.
    expect(nextServer.after).not.toHaveBeenCalled()
  })

  test('returns without throwing when Sentry is not initialised', () => {
    // Arrange — with no client bound, the SDK's captureException does nothing and
    // hands back an empty event id. Local dev and CI both run in this state, so
    // it must be a silent no-op rather than a crash on every handled error.
    sentry.captureException.mockReturnValue('')

    // Act / Assert
    expect(() => reportServerError(new Error('boom'), { action: 'savePost' })).not.toThrow()
    expect(reportServerError(new Error('boom'), { action: 'savePost' })).toBeUndefined()
  })
})
