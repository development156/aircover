import * as Sentry from '@sentry/nextjs'

import { fakeSecretMessage } from '@/lib/observability/debug-fixtures'

import { deliveryVerdict } from './delivery-verdict'

/**
 * Exercises the Sentry wiring in a real request, and reports what it can honestly
 * observe from inside the process.
 *
 * Unit tests pin the scrubber's rules; they cannot tell you that `register()`
 * ran, that the DSN parsed, or that `beforeSend` is attached to the client that
 * handled the request. Only a real error travelling the real path shows that,
 * and this endpoint is how you make one on demand.
 *
 * WHAT IT CAN AND CANNOT PROVE. `?kind=message` awaits `Sentry.flush()`, so a
 * true result means a client existed and its queue drained — the envelope left
 * the process. That is a genuine signal and it replaces the old `sent:
 * Boolean(SENTRY_DSN)`, which only ever proved a string was set. It still stops
 * short of arrival: the transport drains a 403 from a revoked key exactly as it
 * drains a stored event, so the last step is a human looking up the event id in
 * the Sentry UI. delivery-verdict.ts carries the detail and the source
 * references for both limits.
 */

/**
 * Opt out of static generation.
 *
 * Without this, Next treats a GET route handler with no dynamic API as
 * statically prerenderable and EXECUTES it during `next build` — where the
 * default branch throws, and the build fails on a route that was working exactly
 * as designed. `force-dynamic` moves execution to request time, which is the
 * only time a deliberate crash is meaningful.
 */
export const dynamic = 'force-dynamic'

/**
 * How long to wait for the transport queue to empty before giving up on it.
 *
 * Bounded rather than unbounded (`flush()` with no argument waits forever) so a
 * wedged or throttled transport turns into an honest `flushed: false` instead of
 * a request that hangs until the platform's own timeout kills it — at which
 * point the caller learns nothing at all. Two seconds is long enough for a
 * healthy round trip to ingest and short enough that a human waits for it.
 */
const FLUSH_TIMEOUT_MS = 2_000

export async function GET(request: Request) {
  // FIRST STATEMENT IN THE HANDLER, AND IT MUST STAY FIRST.
  //
  // An endpoint that throws on request is a free DoS lever and a firehose of
  // fake alerts into the channel that is supposed to tell us when something is
  // genuinely wrong — the second one is the worse outcome, because a noisy
  // alerting channel gets muted and then real incidents go unread. Anything
  // placed above this line (a log, a header read, an await) becomes reachable in
  // production, so the guard is not just early, it is absolutely first.
  //
  // 404 rather than 403: a 403 confirms the route exists. There is no reason to
  // tell an unauthenticated scanner which debug endpoints we ship.
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 })
  }

  const kind = new URL(request.url).searchParams.get('kind')

  if (kind === 'message') {
    // The only branch that can return an id in the response body: capturing
    // without throwing keeps us in control of the response.
    //
    // THE EVENT ID PROVES NOTHING ON ITS OWN. `captureMessage` generates it
    // locally and returns it synchronously, before any network call — it comes
    // back identical whether the envelope reaches Sentry or the transport 403s
    // it. It is a correlation handle for the Sentry UI, not evidence.
    const eventId = Sentry.captureMessage('sahoda debug: deliberate test message', 'info')

    // The actual signal, and the reason this route is worth calling.
    //
    // `flush(timeout)` resolves true when the client's queue drains inside the
    // timeout and false when it does not — or when no client exists at all. So
    // it distinguishes "the SDK ran and the envelope went out" from "the SDK
    // was never initialised", which no amount of reading process.env can do.
    //
    // It is also a correctness fix independent of verification: on a serverless
    // host the function can freeze the moment the response is returned, killing
    // an in-flight send. Awaiting the flush is what keeps the event alive long
    // enough to leave.
    const flushed = await Sentry.flush(FLUSH_TIMEOUT_MS)

    // Trimmed, because buildSentryOptions trims before deciding whether to
    // enable the SDK — an env line with a stray space is unconfigured there and
    // must read as unconfigured here, or the two disagree about the same var.
    const configured = Boolean(process.env.SENTRY_DSN?.trim())

    return Response.json({
      kind: 'message',
      eventId,
      // `configured` and `flushed` stay separate fields because they are
      // separate claims, and the combination is the only thing that means
      // anything — see delivery-verdict.ts for why either one alone lies.
      ...deliveryVerdict({ configured, flushed }),
    })
  }

  if (kind === 'secret') {
    // The scrubbing proof. This message carries credential-SHAPED text inside
    // the error string itself — the exact shape no key-name policy can catch,
    // and the reason scrub.ts matches on content rather than on field names.
    //
    // The literals live in lib/observability/debug-fixtures.ts so a unit test
    // can assert they really are redactable; see the comment there for why that
    // matters and why they must never be swapped for a real credential.
    //
    // In the Sentry UI the message must read `Bearer [redacted] … [redacted]`.
    // Seeing the raw values means beforeSend is not attached — treat that as an
    // incident, not a failed test.
    throw new Error(fakeSecretMessage())
  }

  // Default: an uncaught server-side error, which is the case that actually
  // exercises `onRequestError`. Nothing is captured explicitly here — if this
  // shows up in Sentry, the instrumentation hook is working, and if it does not,
  // it is not. Capturing manually would make the test pass regardless and prove
  // nothing.
  //
  // No event id comes back to the caller on this path: the request ends as a
  // 500 generated by Next, and the id is assigned inside the hook after the
  // response is already committed. Use `?kind=message` when you need an id to
  // correlate; use this one to verify the hook itself.
  throw new Error('sahoda debug: deliberate unhandled server error')
}
