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
export function ResolveFromLibrary({ cost }: { cost: number }) {
  const router = useRouter()
  const [state, setState] = useState<LibraryResolveState | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h3 flex items-center gap-2 text-ink">
            <Sparkles size={16} strokeWidth={1.8} aria-hidden className="text-accent" />
            Let your library teach the Brand Brain
          </h2>
          <p className="type-sm mt-1 max-w-[62ch] text-muted">
            Sahoda reads what you have added and suggests what it says about your business. It
            changes nothing on its own — every suggestion waits for you on the{' '}
            <Link
              href="/brain/resolve"
              className="font-[550] text-accent underline underline-offset-2"
            >
              resolution console
            </Link>
            , with the passage it came from underneath it.
          </p>
        </div>
        <div className="max-narrow:w-full">
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setState(null)
                const result = await resolveFromLibrary()
                setState(result)
                router.refresh()
              })
            }
          >
            {/* The cost in the LABEL, never a tooltip — docs/26. It is a prop
                because costs are server-owned and a hardcoded one goes stale. */}
            {pending ? 'Reading…' : `Read my library · ${credits(cost)}`}
          </Button>
        </div>
      </div>

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
