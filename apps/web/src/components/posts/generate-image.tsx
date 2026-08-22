'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { generateImage } from '@/app/actions/posts-image'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { Input } from '@/components/ui/input'

import { InlineError } from './inline-error'
import { PendingLines } from './pending-lines'
import { creditWord } from '@/lib/credit-words'

const PENDING_LINES = [
  'Asking for your picture…',
  'Checking it against the channels you picked…',
  'Attaching it to this post.',
] as const

/**
 * Make an image for this post.
 *
 * The cost is shown BEFORE the click, from `creditCost` rather than a literal —
 * the same rule every paid action follows, and the reason the price lives in
 * pricing.config.json.
 *
 * A generated image goes through the identical gate as an uploaded one: the bytes
 * are sniffed for their real format and dimensions and scored against every
 * selected channel. If it fails that, the credit hold is RELEASED and nothing is
 * charged — so a rejected image costs the customer nothing.
 */
export function GenerateImage({ postId, disabled }: { postId: string; disabled?: boolean }) {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  /**
   * `insufficient` is its own shape, not a string, for the same reason the other
   * three paid controls model it that way: it is the ONE refusal that names a
   * route out. Flattened into `error`, this control told the customer
   * "You need 6 credits for this and have 0." and stopped — a shortfall stated
   * with nowhere to go, on the only spend control in the app that offered no
   * top-up. It also dropped the "nothing was charged" reassurance its three
   * siblings carry, which matters most here, right after describing an image.
   */
  const [failure, setFailure] = useState<
    | { kind: 'insufficient'; required: number; available: number }
    | { kind: 'failed'; message: string }
    | null
  >(null)
  const [pending, startTransition] = useTransition()
  const cost = creditCost('image_standard')

  function run() {
    setFailure(null)
    startTransition(async () => {
      const result = await generateImage(postId, { prompt, size: 'square' })
      if (!result.ok) {
        setFailure(
          result.insufficient
            ? { kind: 'insufficient', required: result.required, available: result.available }
            : { kind: 'failed', message: result.message },
        )
        return
      }
      setPrompt('')
      // The row is written server-side; refresh so the media pane shows it.
      router.refresh()
    })
  }

  return (
    <div className="space-y-2" data-guide="post-generate-image">
      {pending ? (
        <PendingLines lines={PENDING_LINES} />
      ) : (
        <>
          <Input
            value={prompt}
            placeholder="Describe the picture you want"
            onChange={(event) => setPrompt(event.target.value)}
          />
          <Button
            variant="secondary"
            className="w-full"
            disabled={disabled || prompt.trim().length < 3}
            onClick={run}
          >
            <Sparkles size={14} aria-hidden />
            <CostLabel action="Make an image" cost={cost} />
          </Button>
        </>
      )}
      <p className="text-[12px] text-muted">
        Square by default, which fits every channel. If the picture doesn&rsquo;t suit the channels
        you picked, it isn&rsquo;t attached and you aren&rsquo;t charged.
      </p>
      {failure !== null ? (
        <InlineError>
          {failure.kind === 'insufficient' ? (
            <>
              An image needs <span className="tabular-nums">{failure.required}</span>{' '}
              {creditWord(failure.required)} and you have{' '}
              <span className="tabular-nums">{failure.available}</span>. Nothing was generated and
              you were not charged.{' '}
              <Link href="/wallet" className="font-semibold underline underline-offset-2">
                Top up your wallet
              </Link>
            </>
          ) : (
            // Verbatim: the action owns the charge statement. Appending our own
            // would contradict it outright when it cannot confirm the charge.
            failure.message
          )}
        </InlineError>
      ) : null}
    </div>
  )
}
