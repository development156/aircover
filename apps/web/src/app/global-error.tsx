'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'

import { ErrorFallback } from '@/components/error-fallback'

// The last boundary. This renders when the ROOT LAYOUT itself throws — a broken
// provider, a font import that 404s, a crash above every other error.tsx.
//
// It REPLACES the root layout rather than rendering inside it, which is why the
// <html> and <body> tags below are mandatory: there is no other component left
// to emit them, and without them React renders into a document with no body and
// the user gets a blank white page instead of this message.
//
// globals.css is imported here for the same reason. Every design token in the
// app is a custom property defined in that stylesheet, and it normally arrives
// via the root layout — the one component that is, by definition, not running.
// Skip this import and the fallback renders as unstyled black-on-white text,
// with `bg-bg` and `text-muted` resolving to nothing at the exact moment we are
// trying to look competent.
import './globals.css'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  // Held in state rather than read during render. `lastEventId()` is a mutable
  // read off the SDK's global scope, so calling it in the render body makes this
  // component non-deterministic and, under StrictMode's double render, capable
  // of returning a different id each pass. Capture then commit, once.
  const [eventId, setEventId] = useState<string>()

  useEffect(() => {
    // Gated on the digest, same as the segment boundaries.
    //
    // A root-layout crash reaches this component by one of two routes, and only
    // one of them needs us. Thrown during CLIENT render — a provider blowing up
    // on hydration — no onRequestError ever fired, and the capture below is the
    // only report that will ever exist. Thrown on the SERVER, Next marks it with
    // a `digest` and onRequestError already reported it with the real message
    // and stack, while what arrives here is React's contentless production
    // stand-in. Capturing that second copy buys nothing: it cannot be joined to
    // the first (captureRequestError never attaches the digest, and a plain
    // `digest` own-property needs extraErrorDataIntegration, which we do not
    // register), and its constant message collapses every server crash in the
    // app into one untriageable issue.
    if (error.digest) return

    Sentry.captureException(error)
    // Read AFTER the capture: this returns the id Sentry assigned to the event
    // above, and it is the whole reason the user has something to quote to
    // support. Reached only on the path that actually captured — past the early
    // return it would return an unrelated earlier event's id, and a reference
    // that points at someone else's crash is worse than no reference. Undefined
    // when Sentry is disabled, which ErrorFallback renders as simply not showing
    // a reference line.
    setEventId(Sentry.lastEventId())
  }, [error])

  return (
    <html lang="en">
      <body>
        {/* No onRetry, deliberately. `reset()` re-renders the same root layout
            that just threw, and root-layout failures are deterministic almost by
            definition — a bad provider is bad on every attempt. A button that
            reliably reproduces the crash reads as a second failure and costs the
            user more trust than showing no button at all. A full page load is
            the honest recovery here, and the browser already has that control. */}
        <div className="grid min-h-screen place-items-center bg-bg px-6">
          <div className="w-full max-w-[520px]">
            {/* The sentence no longer points at "the reference below". Since
                server-origin crashes take the early return in the effect above,
                there is often no reference line at all, and copy naming one that
                is not there sends the user hunting for a string we never
                printed. The line speaks for itself when it exists. */}
            <ErrorFallback
              title="This page didn't load"
              body="Something broke on our side, not yours. Reload the page — if it keeps happening, contact support."
              eventId={eventId}
            />
          </div>
        </div>
      </body>
    </html>
  )
}
