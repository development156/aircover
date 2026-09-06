'use client'

import { useMemo, useState, useTransition } from 'react'
import { Wand2 } from 'lucide-react'

import { planRemix } from '@/app/actions/remix'
import { Button } from '@/components/ui/button'
import { REMIX_CHANNELS, REMIX_KINDS, channelsForKind } from '@/lib/remix/catalogue'
import { previewBatch } from '@/lib/remix/cost'
import type { Channel, RemixKind } from '@sahoda/shared'

/**
 * CHOOSING WHAT TO MAKE — and seeing the price before the batch exists.
 *
 * ── PLANNING IS FREE AND THE SCREEN SAYS SO ──────────────────────────────────
 * This panel calls `planRemix`, which writes rows and charges nothing. The
 * figure below it is the same `previewBatch` the runner charges from, so the
 * number a person reads here is the number they will be asked to approve — not
 * an estimate that firms up later.
 *
 * ── A CHANNEL A KIND CANNOT REACH IS NOT OFFERED ─────────────────────────────
 * `channelsForKind` is derived from the Constraint Engine, so an X thread shows
 * one channel and an adaptation shows four. A checkbox that saved a choice the
 * database refuses would be the fake-success state this product does not ship.
 */

export interface PlanBatchProps {
  posts: ReadonlyArray<{ id: string; title: string | null; body: string | null }>
}

export function PlanBatch({ posts }: PlanBatchProps) {
  const [sourceId, setSourceId] = useState<string>(posts[0]?.id ?? '')
  const [kinds, setKinds] = useState<ReadonlySet<RemixKind>>(
    new Set(REMIX_KINDS.map((k) => k.kind)),
  )
  const [channels, setChannels] = useState<ReadonlySet<Channel>>(new Set(REMIX_CHANNELS))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const planned = useMemo(
    () =>
      REMIX_KINDS.filter((spec) => kinds.has(spec.kind)).flatMap((spec) =>
        channelsForKind(spec.kind)
          .filter((channel) => channels.has(channel))
          .map((channel) => ({ id: `${spec.kind}:${channel}`, kind: spec.kind, included: true })),
      ),
    [kinds, channels],
  )
  const cost = useMemo(() => previewBatch(planned), [planned])

  function toggleKind(kind: RemixKind) {
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
    setError(null)
  }

  function toggleChannel(channel: Channel) {
    setChannels((prev) => {
      const next = new Set(prev)
      if (next.has(channel)) next.delete(channel)
      else next.add(channel)
      return next
    })
    setError(null)
  }

  function plan() {
    setError(null)
    startTransition(async () => {
      const result = await planRemix(sourceId, [...kinds], [...channels])
      if (!result.ok) setError(result.message ?? 'Could not start this batch.')
    })
  }

  return (
    <section aria-labelledby="remix-plan" className="surface-ring rounded-card bg-surface p-4">
      <h2 id="remix-plan" className="type-h2">
        Start with one thing you already wrote
      </h2>
      <p className="type-body mt-1 max-w-[68ch] text-muted">
        Pick a post with more in it than one caption can hold. Nothing is written and nothing is
        charged until you approve the total.
      </p>

      <label className="mt-4 block">
        <span className="type-sm block text-muted">The post to remix</span>
        <select
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
          disabled={pending}
          className="mt-1 w-full rounded-input border border-line bg-bg px-3 py-2 type-body text-ink"
        >
          {posts.map((post) => (
            <option key={post.id} value={post.id}>
              {post.title?.trim() || firstWords(post.body)}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="mt-4">
        <legend className="type-sm text-muted">What to make</legend>
        <ul className="mt-2 grid gap-1.5">
          {REMIX_KINDS.map((spec) => {
            const reach = channelsForKind(spec.kind).filter((c) => channels.has(c))
            return (
              <li key={spec.kind}>
                <label className="flex cursor-pointer items-start gap-3 rounded-input bg-surface-2 p-3">
                  <input
                    type="checkbox"
                    checked={kinds.has(spec.kind)}
                    onChange={() => toggleKind(spec.kind)}
                    disabled={pending}
                    className="mt-icon-nudge size-4 shrink-0 accent-[var(--acc)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="type-h3 block text-ink">{spec.label}</span>
                    <span className="type-sm mt-0.5 block text-muted">{spec.what}</span>
                    <span className="type-sm mt-1 block text-muted">
                      {reach.length === 0 ? 'No channel picked can carry this.' : reach.join(' · ')}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="type-sm text-muted">Where they go</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {REMIX_CHANNELS.map((channel) => (
            <label
              key={channel}
              className="flex cursor-pointer items-center gap-2 rounded-input bg-surface-2 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={channels.has(channel)}
                onChange={() => toggleChannel(channel)}
                disabled={pending}
                className="size-4 accent-[var(--acc)]"
              />
              <span className="type-body text-ink">{channel}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* THE NUMBER, before the batch exists. Same function the runner charges
          from, so it is the figure that will be approved rather than a guess. */}
      <p className="type-body mt-4 text-muted">
        This would write <span className="num text-ink">{cost.includedCount}</span>{' '}
        {cost.includedCount === 1 ? 'draft' : 'drafts'} for{' '}
        <span className="num text-ink">{cost.totalCredits}</span>{' '}
        {cost.totalCredits === 1 ? 'credit' : 'credits'}. Adding a channel adds a draft, not a
        credit. One writing pass covers every channel it is for.
      </p>

      {error ? (
        <p role="alert" className="type-sm mt-3 text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <Button onClick={plan} loading={pending} disabled={planned.length === 0 || sourceId === ''}>
          <Wand2 size={15} strokeWidth={1.8} aria-hidden />
          Plan the batch
        </Button>
      </div>
    </section>
  )
}

/** A body's opening, for a post nobody titled. Never an invented title. */
function firstWords(body: string | null): string {
  const text = (body ?? '').trim().replace(/\s+/g, ' ')
  if (text === '') return 'An empty post'
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}
