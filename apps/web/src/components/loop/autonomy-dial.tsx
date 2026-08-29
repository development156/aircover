'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ChevronRight, Lock } from 'lucide-react'
import { AUTONOMY_LEVELS, type AutonomyLevel, type Channel } from '@sahoda/shared'

import { setChannelAutonomy } from '@/app/actions/loop-dial'
import { ChannelLogo } from '@/components/connections/channel-logo'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { CatalogueChannel } from '@/lib/connections/catalogue'

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
 * ── THE PICKER IS DRAWN AS THE FLOW IT ACTUALLY IS ───────────────────────────
 * Three equal tiles side by side said these were three alternatives, like a
 * plan on a pricing page. They are not: each level is the previous one plus one
 * more thing Sahoda may do, and the order is the order a post travels —
 * suggest, then draft, then publish once approved. Drawing it as a chain with
 * arrows makes the picker say what the ladder underneath has to explain, and it
 * makes the chosen level read as HOW FAR rather than as WHICH.
 *
 * The stages beyond the chosen one are not disabled — they are perfectly
 * choosable, and dimming them would say they were unavailable. They are simply
 * unmarked: everything up to the mark is Sahoda's, everything past it is yours.
 *
 * ── L3 IS A `div`. IT IS NOT A DISABLED BUTTON. ──────────────────────────────
 * A `<button disabled>` is still announced as a button: a screen reader offers
 * it, the reader takes it, nothing happens, and the failure reads as a broken
 * app rather than as an unbuilt feature. It carries no `aria-disabled` either —
 * that attribute describes a control that EXISTS and is momentarily unavailable,
 * which would be a different and untrue claim. The L3 rung is prose with a lock
 * beside it, and the prose says why.
 */

/** The rungs, split by whether a person can actually stand on one. */
const STORABLE = AUTONOMY_LEVELS.filter((l) => l.storable)
const UNREACHABLE = AUTONOMY_LEVELS.filter((l) => !l.storable)

export interface AutonomyDialProps {
  /** Channels this workspace has connected and Sahoda can publish to. */
  connected: readonly Channel[]
  /**
   * Channels connected once, whose authorisation has lapsed.
   *
   * A dial cannot be offered for these — Sahoda cannot post through them — but
   * "connect a channel" is the wrong thing to say to somebody who did. The two
   * states have different remedies and this screen is not entitled to collapse
   * them.
   */
  lapsed?: readonly Channel[]
  /** Levels a person actually chose. A channel absent from this map is UNSET. */
  chosen: Record<string, AutonomyLevel>
  /** What an unset channel runs at. */
  defaultLevel: AutonomyLevel
}

export function AutonomyDial({ connected, lapsed = [], chosen, defaultLevel }: AutonomyDialProps) {
  return (
    <section aria-labelledby="loop-dial" className="flex flex-col gap-3">
      <div>
        <h2 id="loop-dial" className="type-h2">
          How much it does without asking
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          One setting per channel. You can have Sahoda draft for Instagram and publish for Google
          Business Profile. They do not have to move together.
        </p>
      </div>

      {connected.length === 0 ? (
        <p className="surface-ring rounded-card bg-surface p-5 type-body text-muted max-narrow:p-4">
          {lapsed.length > 0 ? (
            <>
              Your {lapsed.map((c) => CHANNEL_LABELS[c]).join(', ')}{' '}
              {lapsed.length === 1 ? 'connection has' : 'connections have'} lapsed, so there is
              nothing the Loop can post through right now.{' '}
              <Link
                href="/connections"
                className="font-[550] text-accent underline underline-offset-2"
              >
                Reconnect
              </Link>{' '}
              and the {lapsed.length === 1 ? 'dial comes' : 'dials come'} back.
            </>
          ) : (
            <>
              Connect a channel and its dial appears here. Until then there is nothing for the Loop
              to set a level for.
            </>
          )}
        </p>
      ) : (
        <ul className="surface-ring divide-y divide-line-soft rounded-card bg-surface shadow-card">
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
      <details className="surface-ring group rounded-card bg-surface">
        <summary className="type-h3 flex cursor-pointer items-center justify-between gap-3 p-5 text-ink max-narrow:p-4">
          What each level means
          <ChevronRight
            size={16}
            strokeWidth={2}
            aria-hidden
            className="shrink-0 text-muted transition-micro group-open:rotate-90"
          />
        </summary>
        <ol className="grid gap-4 px-5 pb-5 max-narrow:px-4 max-narrow:pb-4">
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
              className="grid gap-x-4 gap-y-1 rounded-input bg-s2 p-3 narrow:grid-cols-[52px_1fr]"
            >
              <span className="type-eyebrow num flex items-center gap-1.5 self-start text-muted">
                <Lock size={12} strokeWidth={2} aria-hidden />
                {level.code}
              </span>
              <span className="min-w-0">
                <span className="type-h3 block text-muted">
                  {level.name} <span className="type-sm font-normal">, not available</span>
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
    <li className="grid items-start gap-x-6 gap-y-3 p-5 max-narrow:p-4 wide:grid-cols-[200px_1fr]">
      <div className="flex items-center gap-2.5">
        <ChannelLogo channel={channel as CatalogueChannel} size={20} />
        <div className="min-w-0">
          <h3 className="type-h3 text-ink">{CHANNEL_LABELS[channel]}</h3>
          {level === undefined ? (
            <p className="type-sm text-muted">
              Not set, running at {AUTONOMY_LEVELS[defaultLevel]?.name.toLowerCase()}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <fieldset disabled={pending}>
          <legend className="sr-only">How much Sahoda may do for {CHANNEL_LABELS[channel]}</legend>
          <div className="flex items-stretch gap-1.5 max-narrow:flex-col">
            {STORABLE.map((option, index) => {
              const active = level !== undefined && option.level === current
              const reached = level !== undefined && option.level <= current
              return (
                <div key={option.code} className="flex min-w-0 flex-1 items-center gap-1.5">
                  {index > 0 ? (
                    <ChevronRight
                      size={14}
                      strokeWidth={2}
                      aria-hidden
                      className={[
                        'shrink-0 max-narrow:hidden',
                        reached ? 'text-accent' : 'text-muted',
                      ].join(' ')}
                    />
                  ) : null}
                  <label
                    className={[
                      'flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 rounded-input p-3 transition-micro',
                      'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
                      active
                        ? 'bg-tint-100 text-ink shadow-[inset_0_0_0_1px_var(--acc)] dark:bg-s2'
                        : reached
                          ? 'bg-s2 text-ink'
                          : 'bg-s2 text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name={name}
                      className="sr-only"
                      checked={active}
                      onChange={() => pick(option.level as AutonomyLevel)}
                    />
                    <span className="flex items-center gap-1.5">
                      <span className="type-h3">{option.name}</span>
                      {active ? <span className="type-eyebrow text-accent">Set here</span> : null}
                    </span>
                    <span className="type-sm text-muted">{option.may}</span>
                  </label>
                </div>
              )
            })}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="type-sm mt-2 text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  )
}
