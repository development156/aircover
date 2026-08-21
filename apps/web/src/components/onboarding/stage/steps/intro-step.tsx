'use client'

import { ArrowRight } from 'lucide-react'

export interface IntroStepProps {
  onBegin: () => void
  onLater: () => void
  onReview: () => void
  /**
   * True when this workspace ALREADY has a Brand Brain.
   *
   * ── THE DEFECT THIS ARM EXISTS TO PREVENT ───────────────────────────────────
   * Without it, a workspace that had finished the flow was offered it again from
   * scratch and the ONLY route to the brain it had already resolved was to pay
   * for a new one. `onboarding-flow.tsx` fixed that once by opening on the
   * reveal; the rebuild reintroduced it, and this is that fix in the new
   * design's shape — the intro's own two-button composition, pointed at /brain.
   *
   * It does not render a result card from the onboarding answers, because a
   * returning user does not have those answers: the brain is a resolved payload,
   * the answers were localStorage, and a card assembled from the leftovers would
   * be describing a workspace with values it may no longer hold.
   */
  hasSavedBrain: boolean
  workspaceName: string
  /**
   * Server-decided. The first resolve on a workspace with no Brand Brain runs
   * free — `isFirstResolve` reads `brand_memory`, and the client sends no flag,
   * because a client that could say "free" could say it every time.
   */
  isFree: boolean
  cost: number
}

/** The intro. Two ways forward and neither of them is a wall. */
export function IntroStep({
  onBegin,
  onLater,
  onReview,
  isFree,
  cost,
  hasSavedBrain,
  workspaceName,
}: IntroStepProps) {
  if (hasSavedBrain) {
    return (
      <div className="rise">
        <p className="micro step__eyebrow">Sahoda Brand Brain</p>
        <h1 className="display">
          Your Brand Brain
          <br />
          is ready.
        </h1>
        <p className="lead step__lead">
          Sahoda already has one for {workspaceName}. Open it to read or change what it knows —
          nothing to rebuild and nothing to spend.
        </p>
        <div className="cta-row">
          <button type="button" className="btn btn--primary" id="review-saved" onClick={onReview}>
            <span className="btn__t">Review Brand Brain</span>
            <ArrowRight className="arw" size={18} strokeWidth={1.9} aria-hidden />
          </button>
          <button type="button" className="btn btn--ghost" id="begin" onClick={onBegin}>
            Build a new one
          </button>
        </div>
        <p className="hint" style={{ marginTop: 26 }}>
          {/* Stated before the button is pressed, not after. */}
          Building a new one uses {cost} credits and replaces what is there.
        </p>
      </div>
    )
  }

  return (
    <div className="rise">
      <p className="micro step__eyebrow">Sahoda Brand Brain</p>
      <h1 className="display">
        Let&rsquo;s teach Sahoda
        <br />
        your brand.
      </h1>
      <p className="lead step__lead">
        Give us a little context. We&rsquo;ll turn it into a Brand Brain that understands what your
        business does, who it is for and how it looks.
      </p>
      <div className="cta-row">
        <button type="button" className="btn btn--primary" id="begin" onClick={onBegin}>
          <span className="btn__t">Build my Brand Brain</span>
          <ArrowRight className="arw" size={18} strokeWidth={1.9} aria-hidden />
        </button>
        <button type="button" className="btn btn--ghost" id="later" onClick={onLater}>
          I&rsquo;ll do this later
        </button>
      </div>
      <p className="hint" style={{ marginTop: 26 }}>
        Takes about three minutes. You can stop and come back.{' '}
        {/* The cost, or the absence of one, is stated before anything is spent.
            `isFree` is the server's answer, not a client's assumption. */}
        {isFree
          ? 'Building it is free the first time.'
          : `Rebuilding it uses ${cost} credits, shown again before you spend them.`}
      </p>
    </div>
  )
}
