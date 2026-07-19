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

const INSTRUCTIONS = [
  { value: 'rewrite', label: 'Rewrite' },
  { value: 'shorten', label: 'Shorten' },
  { value: 'hookify', label: 'Hookify' },
] as const

const PENDING_LINES = [
  'Sending the selected text to the model…',
  'Waiting on the rewrite…',
  'Still waiting — I will not charge you if this fails.',
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
  if (fragment.trim() === '') return null

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
            credits used · <span className="tabular-nums">{result.balanceAfter}</span> left
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <Sparkles size={13} className="text-accent" aria-hidden />
          <span className="tabular-nums">{fragment.length.toLocaleString('en-IN')}</span>
          {' characters selected'}
        </span>
        <span className="text-[12px] text-faint">
          Uses <span className="tabular-nums">{cost}</span> credit
          {cost === 1 ? '' : 's'} each
        </span>
      </div>

      {pending ? (
        <PendingLines lines={PENDING_LINES} />
      ) : (
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
      )}

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
        </div>
      ) : null}

      {failure !== null ? (
        <InlineError>
          {failure.kind === 'insufficient' ? (
            <>
              This rewrite needs <span className="tabular-nums">{failure.required}</span> credits
              and you have <span className="tabular-nums">{failure.available}</span>. Nothing was
              charged.{' '}
              <Link href="/wallet" className="font-semibold underline underline-offset-2">
                Top up your wallet
              </Link>
            </>
          ) : (
            <>{failure.message} Try the rewrite again.</>
          )}
        </InlineError>
      ) : null}
    </div>
  )
}
