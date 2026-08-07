'use client'

import { useState, useTransition } from 'react'
import { Ban, EyeOff, FlaskConical, PlayCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { simulatePublish } from '@/app/actions/posts-publish'
import type { PublishReport } from '@/lib/posts/state'
import { describeViolation } from '@/lib/posts/violation-copy'

import { CHANNEL_LABELS } from './channel-label'
import { InlineError } from './inline-error'
import { PendingLines } from './pending-lines'

const PENDING_LINES = [
  'Reading the saved variants…',
  'Checking each one against the channel rules…',
  'Nothing is being sent to any platform.',
] as const

export interface PublishPreviewProps {
  postId: string
}

/**
 * Dry run against the Constraint Engine, then the fixture adapter. This is NOT a
 * publish and must never read as one: `apps/web` cannot reach a real token
 * (vault-only) and cannot write `post_publish_logs` (service-role +
 * `block_mutations`), so `simulatePublish` persists nothing at all.
 *
 * Three outcomes are rendered separately and are never merged: blocked by a
 * channel rule, skipped because the channel is not publishable, and
 * simulated-OK — which still means nothing was posted.
 *
 * Simulated results branch on `result.mode === 'fixture'`, never on the
 * permalink string, and the `fixture://` permalink is deliberately never
 * rendered — not as text and certainly not as an anchor.
 */
export function PublishPreview({ postId }: PublishPreviewProps) {
  const [pending, startTransition] = useTransition()
  const [report, setReport] = useState<PublishReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    setReport(null)
    startTransition(async () => {
      const state = await simulatePublish(postId)
      if (!state.ok) {
        setError(state.message)
        return
      }
      // Branch on the adapter's own label, never on the permalink string. If a
      // future adapter swap ever returned a non-fixture mode down this path, the
      // whole run is suspect — drop it rather than render the survivors under a
      // "simulated" banner that would then be describing something else.
      const fixtures = state.simulated.filter((item) => item.mode === 'fixture')
      if (fixtures.length !== state.simulated.length) {
        setError('Preview is unavailable right now — try again.')
        return
      }
      // Nothing to say at all: report that plainly instead of rendering empty
      // banners, which read as a run that succeeded silently.
      if (fixtures.length === 0 && state.blocked.length === 0 && state.skipped.length === 0) {
        setError('Preview is unavailable right now — try again.')
        return
      }
      setReport({ simulated: fixtures, blocked: state.blocked, skipped: state.skipped })
    })
  }

  return (
    <div className="space-y-2" data-guide="post-preview-publish">
      {pending ? (
        <PendingLines lines={PENDING_LINES} />
      ) : (
        <Button variant="secondary" onClick={run} className="w-full">
          <PlayCircle size={14} aria-hidden />
          Preview publish
        </Button>
      )}
      <p className="text-[12px] text-muted">
        A dry run over your saved variants. Nothing is posted and nothing is recorded.
      </p>

      {error !== null ? <InlineError>{error}</InlineError> : null}

      {report !== null ? (
        <div className="space-y-2">
          {report.blocked.length > 0 ? (
            <div
              role="alert"
              className="space-y-2 rounded-input border border-danger-bg bg-danger-bg p-3"
            >
              <p className="type-eyebrow flex items-center gap-1.5 text-danger">
                <Ban size={13} aria-hidden />
                Blocked by channel rules
              </p>
              <ul className="space-y-1.5">
                {report.blocked.map((item) => (
                  <li key={item.channel} className="text-[13px] text-danger">
                    <span className="font-semibold">{CHANNEL_LABELS[item.channel]}</span> — would be
                    rejected. Fix this before publishing:
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {item.violations.map((violation, index) => {
                        const display = describeViolation(violation)
                        return (
                          <li key={`${display.code}-${index}`} className="tabular-nums">
                            {display.message}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.simulated.length > 0 ? (
            <div className="space-y-2 rounded-input border border-warn bg-warn-bg p-3">
              <p className="type-eyebrow flex items-center gap-1.5 text-warn">
                <FlaskConical size={13} aria-hidden />
                Simulated — nothing was posted
              </p>
              <ul className="space-y-1.5">
                {report.simulated.map((result) => (
                  <li key={result.channel} className="text-[13px] text-warn">
                    <span className="font-semibold">{CHANNEL_LABELS[result.channel]}</span> — passes
                    the channel rules we check. This is a fixture result, not a real post, and no
                    publish was recorded.
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-warn opacity-80">
                Connect a channel, then use Publish below — or set a time and let it go out on its
                own.
              </p>
            </div>
          ) : null}

          {report.skipped.length > 0 ? (
            <div className="space-y-1.5 rounded-input bg-s1 p-3">
              <p className="type-eyebrow flex items-center gap-1.5 text-muted">
                <EyeOff size={13} aria-hidden />
                Not checked
              </p>
              <ul className="space-y-1">
                {report.skipped.map((item) => (
                  <li key={item.channel} className="text-[13px] text-muted">
                    <span className="font-semibold">{CHANNEL_LABELS[item.channel]}</span> — preview
                    isn&rsquo;t something this release can post to, so there is nothing to simulate.
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
