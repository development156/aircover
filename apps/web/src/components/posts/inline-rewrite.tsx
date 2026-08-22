'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { rewriteCaption } from '@/app/actions/posts-ai'
import { selectedText, type SelectionRange } from '@/lib/posts/splice-selection'

import { InlineError } from './inline-error'
import { PendingLines } from './pending-lines'
import { creditWord } from '@/lib/credit-words'

const INSTRUCTIONS = [
  { value: 'rewrite', label: 'Rewrite' },
  { value: 'shorten', label: 'Shorten' },
  { value: 'hookify', label: 'Hookify' },
] as const

const PENDING_LINES = [
  'Sending the selected text to the model…',
  'Waiting on the rewrite…',
  'Still waiting — you are not charged if this fails.',
] as const

type Failure =
  | { kind: 'message'; message: string }
  | { kind: 'insufficient'; required: number; available: number }

export interface InlineRewriteProps {
  body: string
  selection: SelectionRange | null
  /**
   * Splice `replacement` over `range` in the caller's CURRENT body. Returns
   * false when the text at `range` is no longer `expected` — the body moved
   * while the model was working, so applying it would clobber newer typing.
   */
  onReplace: (range: SelectionRange, replacement: string, expected: string) => boolean
}

/**
 * Selection-scoped caption rewrite. The cost is on screen BEFORE the click and
 * the task only ever sees the selected fragment — reassembling the body is this
 * component's job (`spliceSelection`).
 */
export function InlineRewrite({ body, selection, onReplace }: InlineRewriteProps) {
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<Failure | null>(null)
  /** A paid rewrite we could not place. Shown rather than silently discarded. */
  const [stranded, setStranded] = useState<string | null>(null)

  const fragment = selection === null ? '' : selectedText(body, selection)
  const hasSelection = fragment.trim() !== ''

  // The OFFER is gated on a selection. Everything that reports on a rewrite the
  // user has ALREADY paid for is not: this component used to `return null` the
  // moment the selection collapsed, and the caret collapses on any click in the
  // textarea. So clicking away during a rewrite hid the pending lines, and then
  // hid the `stranded` box too — the credit was spent, the model output was
  // sitting in state, and the user saw nothing at all.
  if (!hasSelection && !pending && stranded === null && failure === null) return null

  const cost = creditCost('caption_rewrite')

  function run(instruction: (typeof INSTRUCTIONS)[number]['value']) {
    const range = selection
    if (range === null) return
    setFailure(null)
    setStranded(null)

    startTransition(async () => {
      const result = await rewriteCaption(fragment, instruction, fragment)

      if (result.ok) {
        if (!onReplace(range, result.text, fragment)) {
          setStranded(result.text)
          return
        }
        toast.success(
          <span>
            Rewrote the selection · <span className="tabular-nums">{result.creditsCharged}</span>{' '}
            {creditWord(result.creditsCharged)} used ·{' '}
            <span className="tabular-nums">{result.balanceAfter}</span> left
          </span>,
        )
        return
      }
      setFailure(
        result.insufficient
          ? { kind: 'insufficient', required: result.required, available: result.available }
          : { kind: 'message', message: result.message },
      )
    })
  }

  return (
    <div
      className="space-y-2 rounded-input border border-line bg-s1 p-3"
      data-guide="post-inline-ai"
    >
      {hasSelection ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
            <Sparkles size={13} className="text-accent" aria-hidden />
            {/* Code points, not UTF-16 units — the count the engine uses, so an
                emoji selection does not read as two characters here and one there. */}
            <span className="tabular-nums">
              {Array.from(fragment).length.toLocaleString('en-IN')}
            </span>
            {' characters selected'}
          </span>
          <span className="text-[12px] text-muted">
            Uses <span className="tabular-nums">{cost}</span> credit
            {cost === 1 ? '' : 's'} each
          </span>
        </div>
      ) : null}

      {pending ? <PendingLines lines={PENDING_LINES} /> : null}

      {hasSelection && !pending ? (
        <div className="flex flex-wrap gap-1.5">
          {INSTRUCTIONS.map((instruction) => (
            <Button
              key={instruction.value}
              variant="secondary"
              size="sm"
              onClick={() => run(instruction.value)}
            >
              {instruction.label}
            </Button>
          ))}
        </div>
      ) : null}

      {stranded !== null ? (
        <div
          role="alert"
          className="space-y-1.5 rounded-input border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn"
        >
          <p>
            Your post changed while I was rewriting, so I didn&rsquo;t replace anything. The rewrite
            was still charged — here it is to place yourself.
          </p>
          <p className="rounded-input bg-s1 px-2.5 py-2 text-ink">{stranded}</p>
          {/* Stays until it is dismissed on purpose. It disappeared on its own
              before, which meant a charged result could vanish unread. */}
          <Button variant="ghost" size="sm" onClick={() => setStranded(null)}>
            Discard this rewrite
          </Button>
        </div>
      ) : null}

      {failure !== null ? (
        <InlineError>
          {failure.kind === 'insufficient' ? (
            <>
              {/* The plural is computed, not assumed. MEASURED by rendering the
                  refusal: a caption rewrite costs exactly 1, so this sentence
                  has ALWAYS read "needs 1 credits" — the one branch nobody
                  sees, because a fresh workspace has 100 credits and never
                  reaches it. */}
              This rewrite needs <span className="tabular-nums">{failure.required}</span>{' '}
              {creditWord(failure.required)} and you have{' '}
              <span className="tabular-nums">{failure.available}</span>. Nothing was charged.{' '}
              <Link href="/wallet" className="font-semibold underline underline-offset-2">
                Top up your wallet
              </Link>
            </>
          ) : (
            // Verbatim: the action owns the charge statement and the retry
            // prompt. Appending our own gave the reader two of each, and would
            // contradict the action outright when it cannot confirm the charge.
            failure.message
          )}
        </InlineError>
      ) : null}
    </div>
  )
}
