'use client'

import { Lock } from 'lucide-react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { ChannelLogo } from '@/components/connections/channel-logo'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { ComposerStep, ComposerSteps } from '@/lib/posts/composer-steps'
import { cn } from '@/lib/utils'

/**
 * THE THREE PARTS OF A POST, LISTED DOWN THE SIDE.
 *
 * ── WHAT THIS IS MODELLED ON, AND WHAT IT DELIBERATELY IS NOT ────────────────
 * Founder's ruling, 2026-08-28, with a screenshot of Meta's ads manager: the
 * three things a post is made of belong in a list on the left, and the one being
 * worked on fills the screen on the right. Campaign, ad set, ad becomes: the
 * words, each platform's own version, and how it goes out.
 *
 * It is NOT a wizard, and the difference is the whole design. A wizard owns the
 * order and hands out Next and Back; this hands the writer a map and lets them
 * point at any part of it they have earned. Nothing is finished, nothing is
 * confirmed, and coming back to part one after part three costs one click and
 * loses nothing.
 *
 * ── AND IT IS NOT A TAB STRIP OVER THE VERSIONS ──────────────────────────────
 * The thing this product does that its competitors do not is show every
 * platform's version of a post AT ONCE. That is untouched: part two holds the
 * whole stack, all channels visible together, exactly as before. What the rail
 * switches between is the three PARTS, never the channels inside one.
 *
 * The channels appear here as well, nested under part two the way ad sets nest
 * under a campaign, and pointing at one moves to part two and scrolls its card
 * into view. That is navigation to a card that is already on the screen, not a
 * filter that hides its neighbours.
 *
 * ── A LOCKED PART STAYS LISTED ───────────────────────────────────────────────
 * With a padlock, a sentence saying what to do, and no way to open it. The map
 * is the reason: someone who has written nothing should still be able to see
 * that this screen is going to ask them for platforms and a time. Removing the
 * rows until they work would answer "what happens next" with silence.
 */

export interface ComposerRailProps {
  steps: ComposerSteps
  /** Channels on the post right now, nested under part two. */
  channels: ChannelSet
  /** Which part fills the screen. */
  active: 1 | 2 | 3
  onSelect: (index: 1 | 2 | 3) => void
  /** Go to part two and bring this channel's card into view. */
  onSelectChannel: (channel: Channel) => void
}

const TITLES: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'Write your post',
  2: 'Each platform',
  3: 'Send it',
}

/** What each part is for, in one line, so the rail is readable cold. */
const BLURBS: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'The words, and anything that goes with them',
  2: 'One version per platform, with its own rules',
  3: 'Schedule it, or send it now',
}

interface RowProps {
  index: 1 | 2 | 3
  step: ComposerStep
  active: boolean
  onSelect: (index: 1 | 2 | 3) => void
  children?: React.ReactNode
}

function Row({ index, step, active, onSelect, children }: RowProps) {
  const locked = step.access === 'locked'

  return (
    <li data-rail-step={index} data-rail-locked={locked ? 'true' : 'false'}>
      {/*
        A BUTTON THAT REFUSES, RATHER THAN A DISABLED ONE.

        `disabled` takes the control out of the tab order, so the padlock and the
        sentence beside it become unreachable to anyone navigating by keyboard —
        the reader who most needs to be told why. `aria-disabled` announces the
        refusal and keeps the row reachable, and the handler simply declines.
      */}
      <button
        type="button"
        aria-disabled={locked || undefined}
        aria-current={active ? 'step' : undefined}
        onClick={() => {
          if (!locked) onSelect(index)
        }}
        className={cn(
          'transition-micro w-full rounded-input p-3 text-left',
          locked
            ? 'cursor-not-allowed opacity-60'
            : 'hover:bg-s2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          active && 'surface-ring bg-s2',
        )}
      >
        <span className="flex items-start gap-2">
          <span
            aria-hidden
            className={cn(
              'type-chip grid size-5 shrink-0 place-items-center rounded-full tabular-nums',
              active
                ? 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                : 'surface-ring bg-surface text-muted',
            )}
          >
            {index}
          </span>
          <span className="min-w-0">
            <span className="type-body block font-medium">{TITLES[index]}</span>
            {locked ? (
              <span className="type-meta mt-0.5 flex items-start gap-1.5 text-muted">
                <Lock size={12} strokeWidth={1.8} aria-hidden className="mt-0.5 shrink-0" />
                {step.reason}
              </span>
            ) : (
              <span className="type-meta mt-0.5 block text-muted">{BLURBS[index]}</span>
            )}
          </span>
        </span>
      </button>
      {children}
    </li>
  )
}

export function ComposerRail({
  steps,
  channels,
  active,
  onSelect,
  onSelectChannel,
}: ComposerRailProps) {
  return (
    <nav aria-label="The three parts of this post" data-composer-rail>
      <ol className="space-y-1">
        <Row index={1} step={steps.write} active={active === 1} onSelect={onSelect} />

        <Row index={2} step={steps.channels} active={active === 2} onSelect={onSelect}>
          {channels.length > 0 ? (
            <ul className="mt-1 ml-6 space-y-0.5 border-l border-line pl-2">
              {channels.map((channel) => (
                <li key={channel}>
                  <button
                    type="button"
                    data-rail-channel={channel}
                    onClick={() => onSelectChannel(channel as Channel)}
                    className="transition-micro flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left hover:bg-s2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <ChannelLogo channel={channel as Channel} size={14} className="rounded-sm" />
                    <span className="type-meta truncate">{CHANNEL_LABELS[channel as Channel]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Row>

        <Row index={3} step={steps.send} active={active === 3} onSelect={onSelect} />
      </ol>
    </nav>
  )
}
