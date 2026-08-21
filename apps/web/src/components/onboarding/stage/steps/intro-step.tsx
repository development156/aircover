'use client'

import { ArrowRight } from 'lucide-react'

export interface IntroStepProps {
  onBegin: () => void
  onLater: () => void
  /**
   * Server-decided. The first resolve on a workspace with no Brand Brain runs
   * free — `isFirstResolve` reads `brand_memory`, and the client sends no flag,
   * because a client that could say "free" could say it every time.
   */
  isFree: boolean
  cost: number
}

/** The intro. Two ways forward and neither of them is a wall. */
export function IntroStep({ onBegin, onLater, isFree, cost }: IntroStepProps) {
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
