import type { ChannelRejection } from '@/lib/posts/attach-decision'
import { describeViolation } from '@/lib/posts/violation-copy'

import { CHANNEL_LABELS } from './channel-label'

/**
 * One block per channel that objects to a file, saying WHICH channel and WHY.
 *
 * Two tones because there are two genuinely different outcomes:
 *
 *  - `danger` — the file was refused. The repo's inline error shape (docs/08 §6).
 *  - `warn`   — the file WAS attached and this channel will not use it. Colouring
 *               that as an error would tell the writer their upload failed when
 *               it did not.
 *
 * The ARIA role is deliberately NOT set here: an alert and a status region
 * announce differently and only the caller knows which one it is reporting.
 * Every sentence goes through `describeViolation`, so a violation carrying raw
 * DB text degrades to safe copy instead of reaching a screen.
 */
export type ObjectionTone = 'danger' | 'warn'

export interface ChannelObjectionsProps {
  objections: readonly ChannelRejection[]
  tone: ObjectionTone
}

const TONE_CLASS: Readonly<Record<ObjectionTone, string>> = {
  danger: 'rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger',
  warn: 'rounded-input border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn',
}

export function ChannelObjections({ objections, tone }: ChannelObjectionsProps) {
  if (objections.length === 0) return null

  return (
    <div className="space-y-2">
      {objections.map((objection) => (
        <div key={objection.channel} className={TONE_CLASS[tone]}>
          <p className="font-semibold">{CHANNEL_LABELS[objection.channel]}</p>
          <ul className="mt-1 space-y-0.5">
            {objection.violations.map((violation) => (
              <li key={`${violation.code}-${violation.message}`}>
                {describeViolation(violation).message}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
