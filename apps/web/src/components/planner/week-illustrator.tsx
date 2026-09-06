'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useEffect, useRef, useState } from 'react'
import { Check, ImageIcon, Sparkles } from 'lucide-react'

import { illustratePost, type IllustrateState } from '@/app/actions/illustrate-post'
import { creditWord } from '@/lib/credit-words'
import { cn } from '@/lib/utils'

export interface WeekIllustratorProps {
  /** The planned drafts, in order. One picture each, made in this order. */
  postIds: readonly string[]
  /** What one picture costs, read from pricing before the first press. */
  costPerPicture: number
  onDone?: (summary: { made: number; charged: number; balanceAfter: number | null }) => void
}

type CardState =
  | { kind: 'waiting' }
  | { kind: 'drawing' }
  | { kind: 'done'; previewUrl: string | null; formatLabel: string; note: string | null }
  | { kind: 'failed'; message: string }

/** Sentences that mean the NEXT press would fail the same way. Compared by content, not identity. */
function isRunStopper(message: string): boolean {
  return /not (fully )?configured|sign in/i.test(message)
}

const DRAWING_LINES = [
  'Reading the draft…',
  'Choosing the shape for its channels…',
  'Drawing on brand…',
  'Placing your logo…',
  'Still drawing. A failed picture is not charged.',
] as const

/**
 * THE WEEK'S PICTURES, LANDING ONE BY ONE.
 *
 * One card per planned draft. The cards are made in order, and the one being
 * drawn shows a sweep of light and the honest line about what is happening;
 * when the picture arrives it scales in, the card settles, and a tick pops.
 * The next card starts only after this one has finished, because each picture
 * is its own charge and the order is the plan's order.
 *
 * ── THE MOTION SAYS SOMETHING TRUE ───────────────────────────────────────────
 * The sweep runs only while a real request is in flight; the tick pops only on
 * a picture that arrived; a refused card stops the run and says why, in the
 * action's own words, because the next card would meet the same refusal and
 * spend to prove it. `prefers-reduced-motion` collapses every keyframe through
 * the global block in `tokens.css`.
 */
export function WeekIllustrator({ postIds, costPerPicture, onDone }: WeekIllustratorProps) {
  const [cards, setCards] = useState<CardState[]>(() => postIds.map(() => ({ kind: 'waiting' })))
  const [lineIndex, setLineIndex] = useState(0)
  const started = useRef(false)
  // A ref, not a closure flag. React's development double-mount runs the
  // effect, its cleanup, then the effect again: a closure flag set by the first
  // cleanup would stay true for the loop the first run started, and every
  // result would be thrown away while the cards read "drawing" for ever.
  // MEASURED 2026-09-07 on a local dev server with a real picture charged.
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    if (started.current) return
    started.current = true
    void (async () => {
      let made = 0
      let charged = 0
      let balanceAfter: number | null = null
      for (let i = 0; i < postIds.length; i += 1) {
        if (cancelled.current) return
        setLineIndex(0)
        setCards((current) => current.map((card, j) => (j === i ? { kind: 'drawing' } : card)))
        const result: IllustrateState = await illustratePost(postIds[i])
        if (cancelled.current) return
        if (result.ok) {
          made += 1
          charged += result.creditsCharged
          balanceAfter = result.balanceAfter
          setCards((current) =>
            current.map((card, j) =>
              j === i
                ? {
                    kind: 'done',
                    previewUrl: result.previewUrl,
                    formatLabel: result.formatLabel,
                    note: result.message ?? null,
                  }
                : card,
            ),
          )
          continue
        }
        // The insufficient arm carries figures, not a sentence; say them the
        // way the plan panel does, so the reader knows the shortfall.
        const message = result.insufficient
          ? `The next picture needs ${result.required} ${creditWord(result.required)} and you have ${result.available}. Nothing more was charged.`
          : result.message
        setCards((current) =>
          current.map((card, j) => (j === i ? { kind: 'failed', message } : card)),
        )
        // One refused picture is that picture's news, not the week's: the
        // provider declined a prompt, and the next post's prompt is a
        // different one (MEASURED 2026-09-07: a Google Business post was
        // refused, the X post before it drew fine). Only a reason the next
        // press would meet again stops the run: an empty wallet, or a
        // deployment that cannot charge at all.
        if (result.insufficient || isRunStopper(result.message)) break
      }
      onDone?.({ made, charged, balanceAfter })
    })()
    return () => {
      cancelled.current = true
    }
    // Runs once for the ids it was mounted with. A new plan mounts a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const drawing = cards.some((card) => card.kind === 'drawing')
  useEffect(() => {
    if (!drawing) return
    const timer = setInterval(
      () => setLineIndex((i) => (i + 1 < DRAWING_LINES.length ? i + 1 : i)),
      2200,
    )
    return () => clearInterval(timer)
  }, [drawing])

  const made = cards.filter((card) => card.kind === 'done').length

  return (
    <section aria-label="Pictures for the week" className="mt-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 type-h3 text-ink">
          <ImageIcon size={15} strokeWidth={2} className="text-accent" aria-hidden />
          Pictures for the week
        </h3>
        <p className="type-sm text-muted" aria-live="polite">
          <span className="tabular-nums">{made}</span> of{' '}
          <span className="tabular-nums">{postIds.length}</span> made ·{' '}
          <span className="tabular-nums">{costPerPicture}</span> {creditWord(costPerPicture)} each
        </p>
      </div>

      <ol className="mt-3 grid grid-cols-2 gap-3 narrow:grid-cols-3 wide:grid-cols-5">
        {cards.map((card, i) => (
          <li
            key={postIds[i]}
            data-illustration={card.kind}
            className={cn(
              'surface-ring relative aspect-[4/5] overflow-hidden rounded-card bg-s2 transition-micro',
              card.kind === 'waiting' && 'opacity-50',
              card.kind === 'drawing' && 'illustrate-breathe',
              card.kind === 'done' && 'illustrate-settle',
            )}
          >
            {card.kind === 'drawing' ? (
              <>
                <span aria-hidden className="illustrate-sweep absolute inset-0" />
                <span
                  aria-hidden
                  className="absolute inset-0 grid place-items-center text-accent illustrate-spark"
                >
                  <Sparkles size={22} strokeWidth={1.8} />
                </span>
              </>
            ) : null}

            {card.kind === 'done' && card.previewUrl !== null ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL
              <img
                src={card.previewUrl}
                alt=""
                className="illustrate-arrive size-full object-cover"
              />
            ) : null}

            {card.kind === 'done' ? (
              <span
                aria-hidden
                className="illustrate-tick absolute right-2 top-2 grid size-6 place-items-center rounded-pill bg-surface text-ok shadow-card"
              >
                <Check size={14} strokeWidth={2.5} />
              </span>
            ) : null}

            <span className="absolute inset-x-0 bottom-0 bg-surface/90 px-2 py-1.5 type-meta text-ink">
              <span className="block truncate">
                {card.kind === 'waiting' ? 'Waiting' : null}
                {card.kind === 'drawing' ? DRAWING_LINES[lineIndex] : null}
                {card.kind === 'done' ? card.formatLabel : null}
                {card.kind === 'failed' ? 'Not made' : null}
              </span>
            </span>
            <Link
              href={`/posts/${postIds[i]}` as Route}
              className="absolute inset-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={`Open draft ${i + 1}`}
            />
          </li>
        ))}
      </ol>

      {cards.map((card, i) =>
        card.kind === 'failed' ? (
          <p key={postIds[i]} role="alert" className="mt-3 type-sm text-danger">
            {card.message}
          </p>
        ) : card.kind === 'done' && card.note !== null ? (
          <p key={postIds[i]} className="mt-3 type-sm text-muted">
            {card.note}
          </p>
        ) : null,
      )}
    </section>
  )
}
