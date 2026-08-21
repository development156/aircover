'use client'

import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The line that answers back under a question.
 *
 * THE RULE FROM THE SOURCE, WHICH THIS COMPONENT EXISTS TO KEEP:
 * "Every message on screen is either a restatement of what the user just typed
 *  or a statement of intent about what will happen next. Nothing says 'I
 *  analysed your site' unless a request was actually made."
 *
 * So every caller passes either the user's own words back, or a sentence about
 * what Sahoda WILL do. There is no arm of this component that reports a finding,
 * because at this point in the flow there are none.
 */
export function AiLine({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div className={`ai ${show ? 'show' : 'hide'}`} aria-live="polite">
      <Sparkles className="ai__mark" size={16} strokeWidth={1.6} aria-hidden />
      <span>{children}</span>
    </div>
  )
}
