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
import { creditWord } from '@/lib/credit-words'

const PENDING_LINES = [
  'Saving your post body first…',
  'Asking the model for one version per channel…',
  'Checking each version against the channel rules…',
  'Still working. If this fails you will not be charged.',
] as const

type Outcome =
  | { kind: 'missing'; channels: Channel[] }
  | { kind: 'insufficient'; required: number; available: number }
  | { kind: 'failed'; message: string }

export interface GeneratePanelProps {
  channels: ChannelSet
  /**
   * Write the post NOW and report which row it landed in.
   *
   * Resolves to the post id, or null when the save failed. It returns the ID
   * rather than a boolean because the row may not have existed when this button
   * was rendered: a post is created by its first save, so a writer who types and
   * immediately presses Generate would otherwise hold a `postId` prop captured
   * as null and generate against nothing.
   */
  flush: () => Promise<string | null>
  onGenerated: (variants: GeneratedVariant[]) => void
  /**
   * How loudly this reads. `primary` while adapting IS the next thing to do;
   * `secondary` once every channel already has copy — docs/26 §1.5 allows one
   * primary action per view and the composer moves it as the work progresses.
   */
  emphasis?: 'primary' | 'secondary'
}

/**
 * Generate one variant per selected channel. The credit cost is rendered from
 * `creditCost('post_variants')` BEFORE the click, never after, and a partial
 * result names the channels that came back empty instead of quietly dropping them.
 */
export function GeneratePanel({
  channels,
  flush,
  onGenerated,
  emphasis = 'primary',
}: GeneratePanelProps) {
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const cost = creditCost('post_variants')

  function run(target: ChannelSet) {
    if (target.length === 0) return
    setOutcome(null)

    startTransition(async () => {
      try {
        const postId = await flush()
        if (postId === null) {
          // Component-owned copy, and the one failure where this side can speak to
          // the charge: we never reached the action, so nothing was spent. It
          // carries its own retry prompt because the shared branch below no longer
          // appends one.
          setOutcome({
            kind: 'failed',
            message:
              'Your post body could not be saved, so nothing was generated and no credits were charged. Try again.',
          })
          return
        }

        const result = await generateVariants(postId, target)

        if (result.ok) {
          onGenerated(result.variants)
          toast.success(
            <span>
              Wrote <span className="tabular-nums">{result.variants.length}</span> versions ·{' '}
              <span className="tabular-nums">{result.creditsCharged}</span>{' '}
              {creditWord(result.creditsCharged)} used ·{' '}
              <span className="tabular-nums">{result.balanceAfter}</span> left
            </span>,
          )
          setOutcome(
            result.missing.length > 0 ? { kind: 'missing', channels: result.missing } : null,
          )
          return
        }

        setOutcome(
          result.insufficient
            ? { kind: 'insufficient', required: result.required, available: result.available }
            : { kind: 'failed', message: result.message },
        )
      } catch {
        // ── A DROPPED CONNECTION CRASHED THE WHOLE COMPOSER ──────────────────
        // A server action REJECTS on a transport failure rather than resolving
        // to `{ ok: false }` (the same fact `use-autosave` is built around).
        // These two awaits were unguarded, so a request the network dropped —
        // MEASURED on the preview, a POST redirected mid-flight — escaped the
        // transition and fell to the route error boundary, replacing the entire
        // composer with "This screen didn't load". Inline instead, and DO NOT
        // claim the charge state: if the generate call reached the server it may
        // have run, so the wallet is the source of truth, not this sentence.
        setOutcome({
          kind: 'failed',
          message: 'Sahoda couldn’t finish that just now. Check your wallet, then try again.',
        })
      }
    })
  }

  return (
    <div className="space-y-2" data-guide="post-generate">
      {pending ? (
        <PendingLines lines={PENDING_LINES} />
      ) : (
        <Button variant={emphasis} onClick={() => run(channels)} disabled={channels.length === 0}>
          <Sparkles size={14} aria-hidden />
          {/* ONE span, so the label is ONE flex item — ported from wt-screens,
              which measured it. `Button` is `inline-flex … gap-[6px]`, and a flex
              container wraps every run of bare text in its own anonymous item.
              Written as loose children this label was SIX items — icon, "Adapt
              for", the count, "channels ·", the cost, "credits" — with 6px at
              every seam and each item free to wrap inside itself. MEASURED on
              design-audit-before/light-390/posts-detail.png: it rendered
              "Generate variants / for | 3 | channels / · | 3 | credits". Every
              box was the right size and the sentence was unreadable. At 1440 the
              same seams showed as odd gaps around the numbers. brand-card.tsx
              already carries this fix; this is the sibling that walked through. */}
          <span>
            Adapt for <span className="tabular-nums">{channels.length}</span>
            {channels.length === 1 ? ' channel' : ' channels'} ·{' '}
            <span className="tabular-nums">{cost}</span> {creditWord(cost)}
          </span>
        </Button>
      )}

      {/* ── WHAT THE RUN DOES, AND THE HALF THAT DENIES A PROMISE ─────────────
          One sentence for each, and the second is not optional. "The words a
          customer would search for" implies research on its own, and this
          product has none: `docs/50` established that there is no keyword-volume
          source, no trend feed and no competitor data anywhere in it, and
          nothing since has changed that. A line that named a search term
          WITHOUT saying where it came from would be the same defect as printing
          a figure no query produced.

          Deliberately two short sentences rather than a paragraph. The last
          time this screen grew an explanation it became the largest block of
          prose in the writing column, and that block was removed. Hidden with
          the button when there is nothing to adapt: a description of an action
          nobody can take is furniture. */}
      {!pending && channels.length > 0 ? (
        <p className="type-meta text-muted">
          Written for each channel, with the words a customer would search for. Taken from your own
          post, not from what is popular elsewhere.
        </p>
      ) : null}

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
          Generating needs <span className="tabular-nums">{outcome.required}</span>{' '}
          {creditWord(outcome.required)} and you have{' '}
          <span className="tabular-nums">{outcome.available}</span>. Nothing was generated and you
          were not charged.{' '}
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
