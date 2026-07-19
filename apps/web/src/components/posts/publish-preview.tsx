'use client'

import { useState, useTransition } from 'react'
import { FlaskConical, PlayCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { simulatePublish } from '@/app/actions/posts-publish'
import type { SimulatedPublish } from '@/lib/posts/state'

import { CHANNEL_LABELS } from './channel-label'
import { InlineError } from './inline-error'
import { PendingLines } from './pending-lines'

const PENDING_LINES = [
  'Reading the saved variants…',
  'Running them through the fixture adapter…',
  'Nothing is being sent to any platform.',
] as const

export interface PublishPreviewProps {
  postId: string
}

/**
 * Dry run against the fixture adapter. This is NOT a publish and must never read
 * as one: `apps/web` cannot reach a real token (vault-only) and cannot write
 * `post_publish_logs` (service-role + `block_mutations`), so `simulatePublish`
 * persists nothing at all.
 *
 * Results branch on `result.mode === 'fixture'`, never on the permalink string,
 * and the `fixture://` permalink is deliberately never rendered — not as text
 * and certainly not as an anchor.
 */
export function PublishPreview({ postId }: PublishPreviewProps) {
  const [pending, startTransition] = useTransition()
  const [results, setResults] = useState<SimulatedPublish[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    setResults(null)
    startTransition(async () => {
      const state = await simulatePublish(postId)
      if (!state.ok) {
        setError(state.message)
        return
      }
      // Branch on the adapter's own label, never on the permalink string. If a
      // future adapter swap ever returned a non-fixture mode down this path we
      // must not render it under the "simulated" banner.
      const fixtures = state.simulated.filter((item) => item.mode === 'fixture')
      // Everything got filtered out: report that plainly instead of rendering an
      // empty "Simulated" banner, which reads as a run that succeeded silently.
      if (fixtures.length === 0) {
        setError('Preview is unavailable right now — try again.')
        return
      }
      setResults(fixtures)
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
      <p className="text-[12px] text-faint">
        A dry run over your saved variants. Nothing is posted and nothing is recorded.
      </p>

      {error !== null ? <InlineError>{error}</InlineError> : null}

      {results !== null ? (
        <div className="space-y-2 rounded-input border border-warn bg-warn-bg p-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold tracking-[0.06em] text-warn uppercase">
            <FlaskConical size={13} aria-hidden />
            Simulated — nothing was posted
          </p>
          <ul className="space-y-1.5">
            {results.map((result) => (
              <li key={result.channel} className="text-[13px] text-warn">
                <span className="font-semibold">{CHANNEL_LABELS[result.channel]}</span> — would have
                been accepted. This is a fixture result, not a real post, and no publish was
                recorded.
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-warn opacity-80">
            Connect a channel and publish from the scheduler to post for real.
          </p>
        </div>
      ) : null}
    </div>
  )
}
