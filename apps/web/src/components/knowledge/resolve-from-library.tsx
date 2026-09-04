'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Sparkles } from 'lucide-react'

import { resolveFromLibrary } from '@/app/actions/knowledge'
import type { LibraryResolveState } from '@/app/actions/knowledge'
import { Button } from '@/components/ui/button'
import { credits } from '@/lib/credit-words'

/**
 * "Read my library" — the one control on this screen that spends.
 *
 * ── WHY IT LOOKS DIFFERENT FROM EVERYTHING ELSE HERE ────────────────────────
 * Adding, searching and deleting are free: no model is called on any of those
 * paths. This one calls `brand_extract`, so it carries its cost in the label the
 * way every spending button in this app does, and the sentence beside it says
 * what it will and will not do before it is pressed.
 *
 * ── AND WHY IT PROMISES SO LITTLE ───────────────────────────────────────────
 * It produces SUGGESTIONS. `public.propose_memory_event` names `brand_memory`
 * nowhere and has no parameter for `status`, so nothing this button reaches can
 * change the Brand Brain — a person accepts each one on the Signal Resolution
 * Console, or it stays a suggestion. The copy has to match that exactly: a
 * button that reads "Update my brand" would describe an action the code cannot
 * perform.
 */
export function ResolveFromLibrary({
  cost,
  waiting,
}: {
  cost: number
  /**
   * Suggestions from an EARLIER read that nobody has answered yet, or `null`
   * when that read did not answer. Both non-zero and `null` make this a re-run:
   * a count we could not take is not permission to spend without asking.
   */
  waiting?: number | null
}) {
  const router = useRouter()
  const [state, setState] = useState<LibraryResolveState | null>(null)
  const [pending, startTransition] = useTransition()
  /** Set once this session has already spent, so a second press asks too. */
  const [spent, setSpent] = useState(false)
  const [asking, setAsking] = useState(false)

  const isRerun = spent || waiting === null || (waiting ?? 0) > 0

  const run = () =>
    startTransition(async () => {
      setAsking(false)
      setState(null)
      const result = await resolveFromLibrary()
      setState(result)
      setSpent(true)
      router.refresh()
    })

  return (
    <div className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h3 flex items-center gap-2 text-ink">
            <Sparkles size={16} strokeWidth={1.8} aria-hidden className="text-accent" />
            Turn these into what Sahoda knows about you
          </h2>
          <p className="type-sm mt-1 max-w-[62ch] text-muted">
            Sahoda reads everything you have added and works out your promise, your voice and who
            you are for, quoting the line it got each one from. It changes nothing on its own. Every
            suggestion waits for your yes on the{' '}
            <Link href="/loop" className="font-[550] text-accent underline underline-offset-2">
              What Sahoda noticed
            </Link>
            .
          </p>
        </div>
        <div className="max-narrow:w-full">
          <Button
            variant="primary"
            disabled={pending || asking}
            onClick={() => (isRerun ? setAsking(true) : run())}
          >
            {/* The cost in the LABEL, never a tooltip — docs/26. It is a prop
                because costs are server-owned and a hardcoded one goes stale.
                The label does NOT change on a re-run: it still says what the
                press costs, and the panel below says what makes this one
                different. A button reading "Read again" without the figure
                would be the one place on this screen a spend is unpriced. */}
            {pending ? 'Reading…' : `Read my library · ${credits(cost)}`}
          </Button>
        </div>
      </div>

      {/**
       * THE SECOND PRESS HAS TO BE MEANT.
       *
       * Founder's ruling, 2026-08-29: a misclick here costs credits for
       * nothing. MEASURED, and it is worse than a wasted charge:
       * `propose_memory_event` has no dedupe, so a second read does not
       * refresh the first one's suggestions, it writes another set beside them
       * and the console then holds each one twice.
       *
       * Only on a re-run. A first read is already priced on its own label and
       * explained in the paragraph above, and making somebody confirm a thing
       * they have never done teaches them to click through the confirmation
       * that matters.
       */}
      {asking ? (
        <div className="surface-ring flex flex-col gap-3 rounded-card bg-s2 p-3">
          <p className="type-sm text-ink">
            {waiting === null
              ? `Sahoda has read your library before. Reading it again costs ${credits(cost)} and writes a fresh set of suggestions beside any still waiting for you, rather than replacing them.`
              : (waiting ?? 0) > 0
                ? `You still have ${waiting} ${(waiting ?? 0) === 1 ? 'suggestion' : 'suggestions'} waiting under What Sahoda noticed. Reading again costs ${credits(cost)} and adds a second set beside them, rather than replacing them.`
                : `You have read your library already in this visit. Reading it again costs ${credits(cost)} and writes another set of suggestions.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={run} disabled={pending}>
              {`Read it again · ${credits(cost)}`}
            </Button>
            {/* The way out, named as the thing it protects rather than as
                "Cancel". Nothing is spent and nothing is discarded: the
                suggestions already waiting are untouched either way.

                NOT "Keep what I have", which `sahoda-voice.test.ts` caught. The
                guard is blunt about whose voice a first person belongs to and
                it is right to be: a label reading as the customer speaking is
                one edit away from a sentence where Sahoda does, and this
                product has fixed that twice. */}
            <Button variant="secondary" onClick={() => setAsking(false)} disabled={pending}>
              Leave them as they are
            </Button>
          </div>
        </div>
      ) : null}

      {state ? (
        <p aria-live="polite" className={`type-sm ${state.ok ? 'text-ink' : 'text-muted'}`}>
          {state.message}
          {state.documents && state.documents.length > 0 ? (
            <>
              {' '}
              <span className="text-muted">Read: {state.documents.join(', ')}.</span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
