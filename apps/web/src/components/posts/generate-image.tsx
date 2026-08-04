'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { generateImage } from '@/app/actions/posts-image'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { Input } from '@/components/ui/input'

import { InlineError } from './inline-error'
import { PendingLines } from './pending-lines'

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
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const cost = creditCost('image_standard')

  function run() {
    setError(null)
    startTransition(async () => {
      const result = await generateImage(postId, { prompt, size: 'square' })
      if (!result.ok) {
        setError(
          result.insufficient
            ? `You need ${result.required} credits for this and have ${result.available}.`
            : result.message,
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
        Square by default, which fits every channel. If the picture doesn&rsquo;t suit the
        channels you picked, it isn&rsquo;t attached and you aren&rsquo;t charged.
      </p>
      {error !== null ? <InlineError>{error}</InlineError> : null}
    </div>
  )
}
