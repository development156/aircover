'use client'

import { RotateCw, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

// What a caught crash looks like to the user. Deliberately shaped like
// EmptyState (docs/06 §4.10) — icon in a --t50 circle, one heading, one
// sentence, at most one action — because a crash should read as a state of the
// page, not as a different application briefly showing through.
//
// THE PROPS CARRY NO ERROR OBJECT, AND THAT IS THE POINT.
// This renders in the browser, so anything handed in is one "view source" away
// from the user and from any screen-recording or session-replay tool watching
// the tab. Real thrown values routinely hold connection strings, bearer tokens,
// row payloads and absolute server paths; a `digest` is a server-log join key
// that means nothing to a customer. Accepting an `error` prop would put the
// choice of what to render at every call site, and one boundary spreading
// `{...errorInfo}` would be enough to leak. Instead the only technical string
// that crosses this boundary is the Sentry event id — an opaque handle the user
// can quote to support, which resolves to the detail on OUR side.
export function ErrorFallback({
  title = "This screen didn't load",
  body = 'Something broke on our side, not yours. Try again in a moment. If it keeps happening, contact support.',
  eventId,
  onRetry,
}: {
  title?: string
  body?: string
  /** Sentry event id. Absent when Sentry is off or the capture never returned. */
  eventId?: string
  /** Omit to render no button at all — see the `onRetry` guard below. */
  onRetry?: () => void
}) {
  return (
    // role=alert, not a plain <section>: a boundary swaps the subtree in place
    // without moving focus or changing route, so a screen reader announces
    // nothing. The live region is what makes the swap audible — and it wraps
    // the event id too, so the reference is read out with the failure rather
    // than sitting silently below it.
    <section
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-line bg-bg px-6 py-12 text-center shadow-card"
    >
      {/* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 surface */}
      <span className="grid size-12 place-items-center rounded-pill bg-tint-50 text-accent dark:bg-s2">
        <TriangleAlert size={22} strokeWidth={1.7} aria-hidden />
      </span>
      <h2 className="text-[18px] leading-[26px] font-bold">{title}</h2>
      <p className="max-w-[42ch] text-muted">{body}</p>

      {/* No handler means no button. A "Try again" that reloads nothing reads
          as a second failure — the user presses it, nothing moves, and now they
          distrust the page as well as the error. */}
      {onRetry ? (
        <div className="mt-2">
          <Button type="button" onClick={onRetry}>
            <RotateCw size={14} aria-hidden />
            Try again
          </Button>
        </div>
      ) : null}

      {/* tabular-nums so the id's hex digits keep a fixed advance width: the
          user is going to read this aloud or copy it character by character,
          and proportional digits make that materially harder. */}
      {eventId ? (
        <p className="mt-1 text-[13px] text-muted">
          Reference: <span className="tabular-nums">{eventId}</span>
        </p>
      ) : null}
    </section>
  )
}
