'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'

import { ErrorFallback } from '@/components/error-fallback'

// Segment boundary for the ROOT segment.
//
// WHAT IT COVERS, AND WHY IT WAS MISSING. Every other segment has one —
// (app), (auth), (onboarding) — but src/app/page.tsx sits outside all three
// route groups, so it had no boundary between itself and global-error.tsx. A
// crash there replaced the entire document with the last-resort fallback: no
// ClerkProvider, no fonts, and deliberately no retry button, because a root
// LAYOUT crash genuinely cannot be retried in place. This one can, so the user
// was being handed the worst recovery path in the app for one of the mildest
// failures in it.
//
// This boundary renders INSIDE layout.tsx (error.tsx wraps its own layout's
// children), so the html/body/providers survive and reset() is meaningful.
//
// WHAT IT DOES NOT COVER. It is a sibling of layout.tsx, and a React error
// boundary never catches its own sibling layout — a throw in ClerkProvider or
// in the font loader still goes past this to global-error.tsx. That file is
// still the last resort; this one just stops it being the FIRST resort for the
// root page.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [eventId, setEventId] = useState<string>()

  useEffect(() => {
    // Server-origin errors (those Next marks with a `digest`) are left to
    // onRequestError, which already reported them with the real message and
    // stack. What reaches this component is React's production stand-in, whose
    // message is a constant — capturing it would add a second, unlinkable event
    // and group every server crash in the app under one untriageable issue.
    // Full reasoning in (app)/error.tsx.
    //
    // Especially relevant here: page.tsx is a server component that does nothing
    // but redirect, so essentially everything this boundary sees arrives WITH a
    // digest and takes this return.
    if (error.digest) return

    Sentry.captureException(error)
    // Read after the capture, and only on the capturing path — past the early
    // return it would hand back an unrelated earlier event's id and invite the
    // user to quote a reference describing someone else's crash.
    setEventId(Sentry.lastEventId())
  }, [error])

  return (
    // Centred in the viewport rather than top-aligned like (app)'s: there is no
    // rail or topbar around this one, so a 520px card pinned to the top of an
    // otherwise empty page reads as a half-loaded screen.
    <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-4 py-12">
      <ErrorFallback eventId={eventId} onRetry={reset} />
    </div>
  )
}
