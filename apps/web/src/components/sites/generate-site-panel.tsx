'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Globe } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { generateSite } from '@/app/actions/site-generate'
import { InlineError } from '@/components/posts/inline-error'
import { PendingLines } from '@/components/posts/pending-lines'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const PENDING = [
  'Reading your Brand Brain…',
  'Writing your homepage, section by section…',
  'Building the page with your brand tokens…',
  'Still working — if this fails you will not be charged.',
] as const

type Outcome =
  | { kind: 'generated'; dropped: number }
  | { kind: 'insufficient'; required: number; available: number }
  | { kind: 'failed'; message: string }

/**
 * Generate the site draft (homepage, preview-only). Cost rendered from
 * `creditCost('site_generate')` BEFORE the click; dropped sections are
 * reported, never hidden. Publishing to a real address is deferred and the
 * page copy says so — this panel never implies a deploy.
 */
export function GenerateSitePanel() {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [pending, startTransition] = useTransition()

  const cost = creditCost('site_generate')

  function run() {
    if (name.trim() === '') return
    setOutcome(null)

    startTransition(async () => {
      const result = await generateSite(name, goal)

      if (result.ok) {
        toast.success(
          <span>
            Generated your site draft ·{' '}
            <span className="tabular-nums">{result.creditsCharged}</span> credits used ·{' '}
            <span className="tabular-nums">{result.balanceAfter}</span> left
          </span>,
        )
        setOutcome({ kind: 'generated', dropped: result.dropped })
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
    <section
      data-guide="sites.generate"
      className="space-y-3 rounded-card border border-line bg-bg p-4 shadow-card"
    >
      <div className="flex items-center gap-2">
        {/* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 surface */}
        <span className="grid size-8 place-items-center rounded-pill bg-tint-50 text-accent dark:bg-s2">
          <Globe size={16} strokeWidth={1.8} aria-hidden />
        </span>
        <div>
          <h2 className="text-[15px] leading-5 font-bold">Generate your site</h2>
          <p className="text-[13px] text-muted">
            A one-page site draft, written in your brand voice. Preview only for now — publishing to
            a real address is coming.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="site-name">Site name</Label>
        <Input
          id="site-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          maxLength={80}
          placeholder="Sharma Dental"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="site-goal">Goal (optional)</Label>
        <Textarea
          id="site-goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          disabled={pending}
          rows={2}
          maxLength={500}
          placeholder="Book more appointments from Instagram traffic…"
        />
      </div>

      {pending ? (
        <PendingLines lines={PENDING} />
      ) : (
        <Button onClick={run} disabled={name.trim() === ''} className="w-full">
          <Globe size={14} aria-hidden />
          Generate site · <span className="tabular-nums">{cost}</span> credits
        </Button>
      )}

      {outcome?.kind === 'generated' && outcome.dropped > 0 ? (
        <p className="rounded-input bg-s2 px-3 py-2.5 text-[13px] text-muted">
          <span className="tabular-nums">{outcome.dropped}</span>
          {outcome.dropped === 1 ? ' part of the draft was' : ' parts of the draft were'} unusable
          and left out.
        </p>
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

      {/* The action owns the charge claim — rendered verbatim. */}
      {outcome?.kind === 'failed' ? <InlineError>{outcome.message}</InlineError> : null}
    </section>
  )
}
