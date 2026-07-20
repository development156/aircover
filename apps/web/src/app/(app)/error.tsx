'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'

import { ErrorFallback } from '@/components/error-fallback'

// Segment boundary for the signed-in app.
//
// WHAT IT COVERS. Next renders this boundary INSIDE (app)/layout.tsx, wrapping
// that layout's children. So when a PAGE throws, the layout keeps its own
// render: the rail and topbar stay on screen and the user can walk to another
// screen instead of being dropped onto a dead end. A boundary at the root would
// take the navigation down with the page and turn a one-screen failure into a
// stuck session.
//
// WHAT IT DOES NOT COVER — and this is the part worth knowing. It is a SIBLING
// of (app)/layout.tsx, and a React error boundary never catches its own sibling
// layout. A throw inside <Rail /> or <Topbar /> renders above this file and
// bubbles past it to global-error.tsx, which replaces the whole document and
// offers no retry. The shell surviving a page crash is therefore a fact about
// WHERE the layout renders, not a protection this boundary provides. Topbar's
// three DB reads are guarded at their own call site (components/shell/topbar.tsx)
// precisely because nothing here can catch them.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [eventId, setEventId] = useState<string>()

  useEffect(() => {
    // SERVER-ORIGIN ERRORS ARE NOT CAPTURED HERE, DELIBERATELY.
    //
    // Next sets `digest` on every error that crossed the server boundary, and
    // onRequestError (instrumentation.ts) has already reported that error with
    // its real message, stack and route context. What survives into this
    // component is React's production stand-in: the message is replaced by the
    // constant "An error occurred in the Server Components render" and the
    // stack is gone. Capturing it would add a second event carrying nothing the
    // first one lacks — and because that message is byte-identical for every
    // server crash in the app, Sentry would group them all into a single
    // permanently untriageable issue.
    //
    // Nor could the two be stitched back together afterwards. `digest` is the
    // only key they share, and neither end carries it: @sentry/nextjs 10.66.0's
    // captureRequestError attaches request/route context and a transaction name
    // but never the digest, while a non-standard own property on a client error
    // is only serialized by extraErrorDataIntegration — not a default
    // integration, and not registered in any of our three init paths. Two
    // unlinkable events are strictly worse than one complete one.
    if (error.digest) return

    // Client-side crash: no onRequestError ever fired for it, so this is the
    // only report that will ever exist.
    Sentry.captureException(error)

    // Read AFTER the capture — this returns the id Sentry just assigned, and it
    // is the whole reason the user has something to quote to support. Reached
    // only on the path that actually captured: calling it past the early return
    // above would hand back some earlier, unrelated event's id and invite the
    // user to quote a reference describing someone else's crash. Undefined when
    // Sentry is disabled, which ErrorFallback renders as no reference line.
    setEventId(Sentry.lastEventId())
  }, [error])

  return (
    <div className="mx-auto w-full max-w-[520px] py-12">
      {/* reset() re-runs the failed render of this segment only. Unlike a root
          layout crash, a page-level failure is often transient — an expired
          token, a request that timed out — so retrying here genuinely can
          succeed, which is what earns the button its place. */}
      <ErrorFallback eventId={eventId} onRetry={reset} />
    </div>
  )
}
