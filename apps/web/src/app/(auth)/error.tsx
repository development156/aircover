'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'

import { ErrorFallback } from '@/components/error-fallback'

// Segment boundary for sign-in and sign-up.
//
// Without it, a crash on /sign-in — a Clerk widget failing to mount, a
// hydration mismatch — falls all the way to global-error.tsx, which REPLACES
// the document: ClerkProvider is gone, the fonts are gone, and there is
// deliberately no retry button. The user's only move is to reload, on the one
// screen where they have not yet got far enough to have anything to lose but
// are most likely to conclude the product is broken and leave.
//
// This boundary renders inside (auth)/layout.tsx (error.tsx wraps its own
// layout's children), so the centred auth shell stays and a transient failure
// stays recoverable in place.
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [eventId, setEventId] = useState<string>()

  useEffect(() => {
    // Server-origin errors (those Next marks with a `digest`) are left to
    // onRequestError, which already has the real stack — capturing the
    // message-stripped client copy would only add a second, unlinkable,
    // badly-grouped event. Full reasoning in (app)/error.tsx.
    if (error.digest) return

    Sentry.captureException(error)
    // After the capture, and only on the capturing path: otherwise this returns
    // an unrelated earlier event's id and the reference we show is a lie.
    setEventId(Sentry.lastEventId())
  }, [error])

  return (
    <div className="w-full max-w-[520px]">
      {/* Default copy, deliberately. Earlier drafts ended "contact support with
          the reference below" — which is a promise this component cannot keep:
          server-origin errors take the early return above, so there IS no
          reference line, and the sentence would point at empty space. The
          reference speaks for itself when it exists. */}
      <ErrorFallback eventId={eventId} onRetry={reset} />
    </div>
  )
}
