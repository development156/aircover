'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { creditCost, toChannelSet, type Channel, type ChannelSet } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { generateVariants } from '@/app/actions/posts-ai'
import type { GeneratedVariant } from '@/lib/posts/state'

import { CHANNEL_LABELS } from './channel-label'
import { InlineError } from './inline-error'
import { PendingLines } from './pending-lines'

const PENDING_LINES = [
  'Saving your post body first…',
  'Asking the model for one version per channel…',
  'Checking each version against the channel rules…',
  'Still working — if this fails you will not be charged.',
] as const

type Outcome =
  | { kind: 'missing'; channels: Channel[] }
  | { kind: 'insufficient'; required: number; available: number }
  | { kind: 'failed'; message: string }

export interface GeneratePanelProps {
  postId: string
  channels: ChannelSet
  /** Flush the debounced body autosave. Resolves false when the save failed. */
  flush: () => Promise<boolean>
  onGenerated: (variants: GeneratedVariant[]) => void
}

/**
 * Generate one variant per selected channel. The credit cost is rendered from
 * `creditCost('post_variants')` BEFORE the click, never after, and a partial
 * result names the channels that came back empty instead of quietly dropping them.
 */
export function GeneratePanel({ postId, channels, flush, onGenerated }: GeneratePanelProps) {
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const cost = creditCost('post_variants')

  function run(target: ChannelSet) {
    if (target.length === 0) return
    setOutcome(null)

    startTransition(async () => {
      const saved = await flush()
      if (!saved) {
        // Component-owned copy, and the one failure where this side can speak to
        // the charge: we never reached the action, so nothing was spent. It
        // carries its own retry prompt because the shared branch below no longer
        // appends one.
        setOutcome({
          kind: 'failed',
          message:
            'Your post body could not be saved, so nothing was generated and no credits were charged — try again.',
        })
        return
      }

      const result = await generateVariants(postId, target)

      if (result.ok) {
        onGenerated(result.variants)
        toast.success(
          <span>
            Generated <span className="tabular-nums">{result.variants.length}</span> variants ·{' '}
            <span className="tabular-nums">{result.creditsCharged}</span> credits used ·{' '}
            <span className="tabular-nums">{result.balanceAfter}</span> left
          </span>,
        )
        setOutcome(result.missing.length > 0 ? { kind: 'missing', channels: result.missing } : null)
        return
      }

      setOutcome(
        result.insufficient
          ? { kind: 'insufficient', required: result.required, available: result.available }
          : { kind: 'failed', message: result.message },
      )
    })
  }

  return (
    <div className="space-y-2" data-guide="post-generate">
      {pending ? (
        <PendingLines lines={PENDING_LINES} />
      ) : (
        <Button onClick={() => run(channels)} disabled={channels.length === 0} className="w-full">
          <Sparkles size={14} aria-hidden />
          Generate variants for <span className="tabular-nums">{channels.length}</span>
          {channels.length === 1 ? ' channel' : ' channels'} ·{' '}
          <span className="tabular-nums">{cost}</span> credits
        </Button>
      )}

      {outcome?.kind === 'missing' ? (
        <div className="space-y-1.5 rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
          <p>These channels came back empty. You were charged for the run that did return copy.</p>
          <ul className="space-y-1.5">
            {outcome.channels.map((channel) => (
              <li key={channel} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{CHANNEL_LABELS[channel]}</span>
                <span>couldn&rsquo;t generate</span>
                <button
                  type="button"
                  onClick={() => run(toChannelSet([channel]))}
                  className="rounded-pill border border-warn px-2.5 py-1 text-[12px] font-semibold transition-micro hover:bg-warn hover:text-white"
                >
                  <CostLabel action="Retry this channel" cost={cost} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {outcome?.kind === 'insufficient' ? (
        <InlineError>
          Generating needs <span className="tabular-nums">{outcome.required}</span> credits and you
          have <span className="tabular-nums">{outcome.available}</span>. Nothing was generated and
          you were not charged.{' '}
          <Link href="/wallet" className="font-semibold underline underline-offset-2">
            Top up your wallet
          </Link>
        </InlineError>
      ) : null}

      {/* The charge statement has exactly ONE owner: whoever produced the message.
          The action already says whether you were charged, and it is the only
          side that KNOWS — a lost acknowledgement means it cannot confirm the
          charge, and an unconditional "No credits were charged." here would
          overwrite that truth with a guess. Rendered verbatim for that reason. */}
      {outcome?.kind === 'failed' ? <InlineError>{outcome.message}</InlineError> : null}
    </div>
  )
}
