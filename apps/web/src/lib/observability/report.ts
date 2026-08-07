import 'server-only'

import * as Sentry from '@sentry/nextjs'
import { after } from 'next/server'

/**
 * Report a CAUGHT server-side error to Sentry.
 *
 * WHY THIS EXISTS. Server actions are the primary mutation path in this app, and
 * every one of them wraps its body in a try/catch that turns a throw into a
 * Result envelope — `{ ok: false, message: 'Could not save this post — try
 * again.' }`. That is the right thing to show a user and the reason we were
 * flying blind: `onRequestError` (instrumentation.ts) fires only for errors that
 * ESCAPE the request, so an error we handle is by construction an error Sentry
 * never hears about. A Supabase outage, a mesh timeout, a zod parse failure and a
 * lost credit ack all looked identical from the outside: calm prose, no signal.
 * This helper is the one seam that closes that gap.
 *
 * It does not change what the user sees. Call it inside the catch, then return
 * exactly the envelope you were already returning.
 *
 * ON THE `workspaceId` HOIST YOU WILL SEE AT MOST CALL SITES. Actions resolve the
 * workspace with `const workspace = await getActiveWorkspace()` INSIDE the try,
 * which block-scopes it away from the catch — so the tenant tag would be missing
 * on precisely the failures worth correlating. Callers therefore declare a
 * `let workspaceId: string | undefined` above the try and assign it the moment
 * the workspace is resolved. That is a re-use of a value the action already has,
 * never a second lookup: this helper must never cost a query, least of all on a
 * path that is already failing.
 */

/**
 * How long to let the SDK finish its HTTP round-trip to Sentry, in ms.
 *
 * `flush` resolves early the moment the queue drains, so this is a ceiling and
 * not a cost we pay per error. It bounds the tail: the work is scheduled after
 * the response, but a serverless platform still bills for it and will eventually
 * kill the invocation, so an unbounded wait on an unreachable ingest endpoint
 * would turn a Sentry outage into a billing one.
 */
const FLUSH_TIMEOUT_MS = 2000

/**
 * Push the queued event out of the process before the platform freezes it.
 *
 * THE FAILURE THIS PREVENTS. `captureException` is not a send — it puts the
 * event on an in-memory queue that the transport drains asynchronously. On a
 * normal server the process keeps running and the queue drains on its own. On a
 * serverless platform the invocation can be FROZEN the instant the response is
 * returned, and anything still queued dies with it. So the reporting we built
 * for server actions could have reported nothing at all in production while
 * looking perfectly wired in dev, in tests and in code review — the worst shape
 * an observability bug can take, because the silence reads as "no errors".
 *
 * WHY `after` AND NOT `await`. Making `reportServerError` async would change ~19
 * call sites and, worse, put a network round-trip on the user's critical path at
 * the exact moment something has already gone wrong. `after` runs the callback
 * once the response has been sent, which is precisely what it exists for.
 */
function scheduleFlush(): void {
  try {
    after(async () => {
      try {
        await Sentry.flush(FLUSH_TIMEOUT_MS)
      } catch (flushError) {
        // Safe to log loudly here: this runs after the response, so nothing the
        // user is waiting on is affected. Message only — a transport error can
        // carry the DSN.
        console.error(
          '[observability] could not flush events to Sentry',
          flushError instanceof Error ? flushError.message : 'unknown',
        )
      }
    })
  } catch {
    // SWALLOWED DELIBERATELY, AND THIS IS THE ONE PLACE IN THIS FILE WHERE
    // SILENCE IS RIGHT.
    //
    // `after` throws (E468) when called outside a request scope. That is not a
    // malfunction, it is this helper being called from somewhere with no
    // response to come after: a script, a background job, a test. In exactly
    // those places there is no freeze to race — the process lives on and the
    // transport drains normally — so the flush was unnecessary and its absence
    // costs nothing.
    //
    // Logging it would therefore print an error on a path that is working
    // correctly, on every handled error, in every test that exercises one.
    //
    // The capture above has ALREADY happened by the time we get here — ordering
    // that matters, which is why the call sits after it rather than before. So
    // even if `after` threw for some reason other than scope, we lose only the
    // early flush and land exactly where this code was before the flush existed.
  }
}

export interface ServerErrorContext {
  /** The exported action name, e.g. `savePost`. Becomes the `action` tag. */
  action: string
  /** Passed only where the action already resolved it — never fetched for this. */
  workspaceId?: string
}

export function reportServerError(error: unknown, context: ServerErrorContext): void {
  try {
    // TAGS, not `extra`. Sentry indexes tags, so `action` makes the error stream
    // facetable — "savePost is failing" is answerable from the sidebar instead of
    // by opening events one at a time — and it keeps grouping meaningful when two
    // unrelated actions fail on the same shared Supabase frame.
    //
    // `workspace_id` is a TENANT identifier, not personal data: it names an
    // account, not a human, and it is the single most useful correlation key in a
    // multi-tenant app — it is what separates "some errors" from "this customer
    // is entirely down". Nothing identifying a PERSON goes here. No email, no
    // display name, no user id. Those buy us little that the workspace does not
    // already give, and this helper sits on every failure path in the app, which
    // makes it the easiest place in the codebase to leak PII by accident.
    //
    // Omitted rather than blanked when absent: '' and 'undefined' are real tag
    // values in Sentry and would fill the facet with a bucket that means nothing.
    const tags = {
      action: context.action,
      ...(context.workspaceId ? { workspace_id: context.workspaceId } : {}),
    }

    Sentry.captureException(error, { tags })

    // STRICTLY AFTER the capture. `scheduleFlush` swallows its own failures, but
    // if the order were reversed an `after` that threw for an unforeseen reason
    // would land in the outer catch below and skip the capture entirely — the
    // flush is a delivery optimisation and must never be able to cost us the
    // event it was added to protect.
    scheduleFlush()
  } catch (reportingError) {
    // THE WHOLE POINT OF THIS CATCH. We are running inside another catch block,
    // on a user path, after something already went wrong. If reporting threw, it
    // would escape the action's own catch and convert a handled failure — one the
    // user would have seen as a polite retry message — into an unhandled 500.
    // Observability is allowed to lose an event; it is not allowed to make the
    // outage worse.
    //
    // Not silent: the local log is the only channel left when the remote one is
    // the thing that broke. Message only — a transport error can carry the DSN.
    console.error(
      '[observability] could not report a server error',
      reportingError instanceof Error ? reportingError.message : 'unknown',
    )
  }
}
