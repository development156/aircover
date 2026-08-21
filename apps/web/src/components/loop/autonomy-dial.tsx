'use client'

import { useState, useTransition } from 'react'
import { Check, Lock } from 'lucide-react'
import { AUTONOMY_LEVELS, type AutonomyLevel, type Channel } from '@sahoda/shared'

import { setChannelAutonomy } from '@/app/actions/loop-dial'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'

/**
 * THE AUTONOMY DIAL — four levels of how much Sahoda may do without asking, and
 * only three of them are places you can stand.
 *
 * ── TWO SURFACES, BECAUSE THEY DO TWO JOBS ───────────────────────────────────
 * The LADDER explains what the levels mean. The PICKER sets one per channel.
 * They were one widget in the first draft and that forced a bad trade: either
 * L3 disappears from the control (and the reader never learns autopilot is the
 * thing this is climbing towards) or a dead fourth cell repeats once per
 * channel, which is four pieces of noise to make one point.
 *
 * Split, the ladder says it once, in the place a reader goes to understand the
 * levels — and the picker offers the three levels that exist, with no gap where
 * a fourth was removed.
 *
 * ── L3 IS A `div`. IT IS NOT A DISABLED BUTTON. ──────────────────────────────
 * A `<button disabled>` is still announced as a button: a screen reader offers
 * it, the reader takes it, nothing happens, and the failure reads as a broken
 * app rather than as an unbuilt feature. It carries no `aria-disabled` either —
 * that attribute describes a control that EXISTS and is momentarily unavailable,
 * which would be a different and untrue claim. The L3 rung is prose with a lock
 * beside it, and the prose says why.
 *
 * ── WHY A LADDER AND NOT A SLIDER (wt-ia's reasoning, still right) ────────────
 * A slider's positions are interchangeable points on a continuum; these are not.
 * Each level adds a specific permission AND carries a specific precondition, and
 * a slider has nowhere to put a precondition.
 */

/** The rungs, split by whether a person can actually stand on one. */
const STORABLE = AUTONOMY_LEVELS.filter((l) => l.storable)
const UNREACHABLE = AUTONOMY_LEVELS.filter((l) => !l.storable)

export interface AutonomyDialProps {
  /** Channels this workspace has connected. */
  connected: readonly Channel[]
  /** Levels a person actually chose. A channel absent from this map is UNSET. */
  chosen: Record<string, AutonomyLevel>
  /** What an unset channel runs at. */
  defaultLevel: AutonomyLevel
}

export function AutonomyDial({ connected, chosen, defaultLevel }: AutonomyDialProps) {
  return (
    <section aria-labelledby="loop-dial" className="flex flex-col gap-3">
      <div>
        <h2 id="loop-dial" className="type-h2">
          How much it does without asking
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          One setting per channel. You can have Sahoda draft for Instagram and publish for Google
          Business Profile — they do not have to move together.
        </p>
      </div>

      {connected.length === 0 ? (
        <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
          Connect a channel and its dial appears here. Until then there is nothing for the Loop to
          set a level for.
        </p>
      ) : (
        <ul className="grid gap-2">
          {connected.map((channel) => (
            <ChannelDial
              key={channel}
              channel={channel}
              chosen={chosen[channel]}
              defaultLevel={defaultLevel}
            />
          ))}
        </ul>
      )}

      {/* The ladder: reference material, and the only place L3 appears. */}
      <details className="surface-ring rounded-card bg-surface p-4">
        <summary className="type-h3 cursor-pointer text-ink">What each level means</summary>
        <ol className="mt-3 grid gap-2">
          {STORABLE.map((level) => (
            <li key={level.code} className="grid gap-x-4 gap-y-1 narrow:grid-cols-[52px_1fr]">
              <span className="type-eyebrow num self-start text-muted">{level.code}</span>
              <span className="min-w-0">
                <span className="type-h3 block text-ink">{level.name}</span>
                <span className="type-body mt-0.5 block text-muted">{level.may}</span>
                <span className="type-sm mt-1 block text-muted">
                  <span className="type-eyebrow mr-1.5 text-muted">Needs</span>
                  {level.needs}
                </span>
              </span>
            </li>
          ))}

          {/* Not a control. A div, with no aria-disabled — see the header. */}
          {UNREACHABLE.map((level) => (
            <li
              key={level.code}
              className="grid gap-x-4 gap-y-1 rounded-input bg-subtle p-3 narrow:grid-cols-[52px_1fr]"
            >
              <span className="type-eyebrow num flex items-center gap-1.5 self-start text-muted">
                <Lock size={12} strokeWidth={2} aria-hidden />
                {level.code}
              </span>
              <span className="min-w-0">
                <span className="type-h3 block text-muted">
                  {level.name} <span className="type-sm font-normal">— not available</span>
                </span>
                <span className="type-body mt-0.5 block text-muted">{level.may}</span>
                <span className="type-sm mt-1 block text-muted">{level.needs}</span>
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}

function ChannelDial({
  channel,
  chosen,
  defaultLevel,
}: {
  channel: Channel
  chosen: AutonomyLevel | undefined
  defaultLevel: AutonomyLevel
}) {
  // Optimistic local state so the row does not flicker back to the old level
  // while the write is in flight, with the server's refusal replacing it if the
  // write fails. `chosen` staying undefined matters: the row must keep saying
  // "not set yet" until a person actually picks, and an initial value of
  // `defaultLevel` would silently claim they had.
  const [level, setLevel] = useState<AutonomyLevel | undefined>(chosen)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const current = level ?? defaultLevel
  const name = `dial-${channel}`

  function pick(next: AutonomyLevel) {
    if (next === level) return
    const previous = level
    setLevel(next)
    setError(null)
    startTransition(async () => {
      const result = await setChannelAutonomy(channel, next)
      if (!result.ok) {
        setLevel(previous)
        setError(result.message ?? 'Could not save that.')
      }
    })
  }

  return (
    <li className="surface-ring rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="type-h3 text-ink">{CHANNEL_LABELS[channel]}</h3>
        {level === undefined ? (
          <span className="type-sm text-muted">
            Not set — running at {AUTONOMY_LEVELS[defaultLevel]?.name.toLowerCase()}
          </span>
        ) : null}
      </div>

      <fieldset className="mt-3" disabled={pending}>
        <legend className="sr-only">How much Sahoda may do for {CHANNEL_LABELS[channel]}</legend>
        <div className="grid gap-1.5 narrow:grid-cols-3">
          {STORABLE.map((option) => {
            const active = level !== undefined && option.level === current
            return (
              <label
                key={option.code}
                className={[
                  'flex cursor-pointer items-start gap-2 rounded-input p-2.5 transition-colors',
                  'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
                  active ? 'bg-accent-subtle text-ink' : 'bg-subtle text-muted hover:text-ink',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name={name}
                  className="sr-only"
                  checked={active}
                  onChange={() => pick(option.level as AutonomyLevel)}
                />
                <span
                  aria-hidden
                  className="mt-[3px] flex size-3.5 shrink-0 items-center justify-center"
                >
                  {active ? <Check size={13} strokeWidth={2.5} className="text-accent" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="type-h3 block">{option.name}</span>
                  <span className="type-sm mt-0.5 block text-muted">{option.may}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="type-sm mt-2 text-danger">
          {error}
        </p>
      ) : null}
    </li>
  )
}
