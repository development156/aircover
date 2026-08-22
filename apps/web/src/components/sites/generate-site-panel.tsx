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
import { CostLabel } from '@/components/ui/cost-label'
import { creditWord } from '@/lib/credit-words'

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

export interface GenerateSitePanelProps {
  /**
   * The plan sentence when this workspace may NOT generate another site, else null.
   *
   * REQUIRED, not optional-with-a-default. An omitted prop defaulting to null would
   * silently render the un-gated panel — the exact shape of the bug this gate exists
   * to close — and every caller that forgot it would look correct. The page owns the
   * read; this component only renders what it is told.
   *
   * Null on an unreadable plan too, deliberately: the pre-click UI must not claim a
   * limit it could not confirm. The server action still fails closed, so the honest
   * outcome there is a refusal at click time, not a fabricated notice now.
   */
  limitNotice: string | null
}

/**
 * Generate the site draft (homepage, preview-only). Cost rendered from
 * `creditCost('site_generate')` BEFORE the click; dropped sections are
 * reported, never hidden. Publishing to a real address is deferred and the
 * page copy says so — this panel never implies a deploy.
 *
 * The PLAN limit is shown before the click for the same reason the cost is: a
 * customer who learns "Sites are on Starter and above" after filling in a name and
 * committing to a 100-credit action has been made to work for a refusal we could
 * have shown them for free. The action re-checks regardless — this notice is
 * courtesy, never the enforcement.
 */
export function GenerateSitePanel({ limitNotice }: GenerateSitePanelProps) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [pending, startTransition] = useTransition()

  const cost = creditCost('site_generate')

  const blocked = limitNotice !== null

  function run() {
    if (name.trim() === '' || blocked) return
    setOutcome(null)

    startTransition(async () => {
      const result = await generateSite(name, goal)

      if (result.ok) {
        toast.success(
          <span>
            Generated your site draft ·{' '}
            <span className="tabular-nums">{result.creditsCharged}</span>{' '}
            {creditWord(result.creditsCharged)} used ·{' '}
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

      {/* The limit, before the click — same moment the cost is shown.
          AND THE WAY OUT. This said "your Free plan doesn't include one" and
          stopped there, which is a dead end: the sentence names a plan the
          reader cannot reach from the screen telling them about it. The plans
          live on /wallet, so the notice now ends at the door rather than at a
          wall. docs/ux-findings.md #13. */}
      {blocked ? (
        <div className="rounded-input bg-s2 px-3 py-2.5" role="status">
          <p className="text-[13px] text-muted">{limitNotice}</p>
          <Link
            href="/wallet"
            className="mt-1 inline-flex items-center rounded-sm text-[13px] font-semibold text-accent transition-micro hover:underline max-narrow:min-h-[44px]"
          >
            See plans
          </Link>
        </div>
      ) : null}

      {pending ? (
        <PendingLines lines={PENDING} />
      ) : (
        <Button onClick={run} disabled={blocked || name.trim() === ''} className="w-full">
          <Globe size={14} aria-hidden />
          <CostLabel action="Generate site" cost={cost} />
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
          Generating needs <span className="tabular-nums">{outcome.required}</span>{' '}
          {creditWord(outcome.required)} and you have{' '}
          <span className="tabular-nums">{outcome.available}</span>. Nothing was generated and you
          were not charged.{' '}
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
