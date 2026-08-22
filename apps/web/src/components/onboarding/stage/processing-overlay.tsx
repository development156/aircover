'use client'

import { Brain } from 'lucide-react'
import type { RefObject } from 'react'

export interface ProcessingOverlayProps {
  on: boolean
  slotRef: RefObject<HTMLDivElement | null>
  /** The facet currently being absorbed, named. Never a percentage. */
  message: string
  /**
   * Set when the resolve failed. The processing screen HOLDS rather than
   * advancing: landing on a result card after a failed resolve would present a
   * finished Brand Brain that does not exist.
   */
  failure: { message: string; retryable: boolean } | null
  onRetry: () => void
  onBack: () => void
}

/**
 * The build screen.
 *
 * NO PERCENTAGE. There is no measurable denominator here — the resolve takes as
 * long as the model takes — and a number that climbs to 87% and stops is
 * something users learn to distrust. The status line names the facet actually
 * being absorbed instead.
 *
 * The facet choreography is the source's, unchanged: six facets, one collapsing
 * every 480ms after a 700ms lead-in. What is NOT the source's is the exit: the
 * source runs a fixed 4,280ms timer and then declares the brain built. A real
 * resolve is a model call — `door-step.tsx` records brand_extract at p50 26.3s
 * in production — so the choreography can finish long before the request does.
 * Here it holds on the last facet until the resolve actually settles, and it
 * advances only on success. That is not a change to the design; it is the
 * design's own rule ("never claims to have done work it has not done") applied
 * to a request that really happens.
 */
export function ProcessingOverlay({
  on,
  slotRef,
  message,
  failure,
  onRetry,
  onBack,
}: ProcessingOverlayProps) {
  return (
    <div className={`proc ${on ? 'on' : ''}`} id="proc" role="status" aria-live="polite">
      <div className="proc__ambient" aria-hidden="true">
        <div className="proc__glow" />
        <div className="proc__ring" />
      </div>

      <div className="proc__wrap">
        <div className="proc__head">
          <div className="proc__badge">
            <Brain size={16} strokeWidth={1.8} aria-hidden />
            <span>Sahoda Intelligence</span>
          </div>
          <h2 className="proc__t">
            {failure ? 'Your Brand Brain was not built.' : 'Building your Brand Brain.'}
          </h2>
          <p className="proc__d">
            {failure
              ? 'Everything you entered is still here. Nothing was charged.'
              : 'Sahoda is turning everything you shared into a living brand intelligence system.'}
          </p>
        </div>

        <div className="proc__orb-stage">
          <div className="proc__canvas" id="proc-slot" ref={slotRef} />
        </div>

        <div className="proc__foot">
          {failure ? (
            <div className="proc__status-card" style={{ flexDirection: 'column', gap: 12 }}>
              <span className="proc__status-label">{failure.message}</span>
              <div className="cta-row" style={{ margin: 0 }}>
                {/* Retry is offered ONLY where trying again can work. On a fault
                    that is the session or the account it cannot, and a button
                    that reruns a request already known to fail is a dead end
                    wearing the clothes of a remedy. */}
                {failure.retryable ? (
                  <button type="button" className="btn btn--primary" onClick={onRetry}>
                    <span className="btn__t">Try again</span>
                  </button>
                ) : null}
                <button type="button" className="btn btn--ghost" onClick={onBack}>
                  Back to my answers
                </button>
              </div>
            </div>
          ) : (
            <div className="proc__status-card">
              <span className="proc__pulse-dot">
                <i />
              </span>
              <span className="proc__status-label" id="proc-msg">
                {message}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
