'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'

import { ErrorFallback } from '@/components/error-fallback'

// Segment boundary for the Brand Brain setup flow.
//
// Onboarding is where a new workspace does its most write-heavy work, so a
// crash here is both more likely and more expensive than elsewhere: falling
// through to global-error.tsx would replace the document and leave a
// half-configured brand with no retry and no way back into the flow.
//
// IT CARRIES ITS OWN SHELL, and that is not decoration. The (onboarding) group
// has no layout.tsx of its own — the layout lives one segment deeper, at
// (onboarding)/onboarding/layout.tsx — so this boundary sits ABOVE it and
// renders in its place, directly inside the root layout. Without the wrapper
// below there is nothing left to supply the full-height bg-s1 canvas, and the
// fallback lands as a bare card against the default background.
export default function OnboardingError({
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
    <div className="grid min-h-dvh place-items-center bg-s1 p-page max-narrow:p-page-mobile">
      <div className="w-full max-w-[520px]">
        {/* "restart setup", not "try again", because that is what the button
            actually does. OnboardingFlow holds every in-flight answer in
            useState — the three picks, the door text, the refusal, the resolved
            brain — and nothing is written until the resolve_brand_memory RPC at
            Approve. reset() re-renders the segment from the server component, so
            a brain that was already SAVED comes back (page.tsx reads it), while
            everything answered since the last save does not. Copy promising the
            user their progress survives would be false for the half that matters.

            The sentence stops at "contact support" and does not point at the
            reference: server-origin errors take the early return above and
            render no reference line, so naming it here would point at empty
            space. It speaks for itself when it exists. */}
        <ErrorFallback
          title="Setup didn't load"
          body="Something broke on our side, not yours. Try again to restart setup — if it keeps happening, contact support."
          eventId={eventId}
          onRetry={reset}
        />
      </div>
    </div>
  )
}
