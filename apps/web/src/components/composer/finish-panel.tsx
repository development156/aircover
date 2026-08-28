'use client'

import { useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { CalendarClock, Send } from 'lucide-react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { cn } from '@/lib/utils'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * ── BOTH HALVES ARE FETCHED WHEN THEY ARE ASKED FOR ──────────────────────────
 * Not a flourish, a measurement. `/(app)/posts/[id]` is the heaviest route in
 * the product and `scripts/perf/js-budget.mjs` allows 8 kB of growth before
 * `pnpm build` fails. With both halves imported normally this change built to
 * **948.3 kB against a 937.2 kB budget, plus 11.1 kB, which fails**; the same
 * tree without it built green.
 *
 * They earn the split on their own terms rather than to buy headroom: neither is
 * on the screen until a writer says which one they came for, and between them
 * they pull `ScheduleField` (318 lines), `PublishNow` (266), the schedule-choice
 * maths, the lead-time validator, the channel status list and the whole
 * violation-copy table.
 *
 * Stated plainly, because the green tick does not say it: `js-budget.mjs:17-19`
 * records that bytes fetched AFTER load are outside what it measures. This MOVES
 * those bytes; a writer who publishes still downloads them, once.
 */
const FinishSchedule = dynamic(() => import('./finish-schedule'), { ssr: false })
const FinishPublish = dynamic(() => import('./finish-publish'), { ssr: false })

export interface FinishPanelProps {
  postId: string | null
  channels: ChannelSet
  scheduledAt: string | null
  onScheduleChange: (iso: string | null) => void
  scheduleError: string | null
  autoPublish: boolean
  connected?: ReadonlySet<Channel>
  statusRows: readonly VariantStatusRow[]
  /** Write the post now. Resolves false when the save failed. */
  flush: () => Promise<boolean>
  /** Write one channel's variant and wait for it. */
  saveVariantNow: (channel: Channel) => Promise<boolean>
  /** Write the post and every dirty variant, and report whether all of it landed. */
  saveAllVersions: () => Promise<boolean>
  /** How many versions are not in their row yet. */
  unsavedVersions: number
}

/** The two things that can happen to a finished post. */
type Route = 'schedule' | 'now'

interface RouteTileProps {
  icon: ReactNode
  title: string
  detail: string
  on: boolean
  onClick: () => void
}

/**
 * One of the two big choices.
 *
 * ── WHY NEITHER OF THESE IS PAINTED IN THE BRAND FILL ────────────────────────
 * They are the loudest pair on the screen and the temptation is obvious. docs/37
 * §2.3 rationed the solid brand fill to ONE element per view. That is overruled
 * for this panel (REQUESTS §31) and the fill now marks the acts: Save, Send now
 * and Confirm schedule all carry it.
 *
 * These two are not acts, they are a QUESTION — which ending did you come for.
 * So they wear the treatment `ScheduleField`'s time chips already use for "this
 * is the one selected": the ink fill. Two sibling tiles painted like the most
 * important action on the page would tell the reader nothing about which to
 * press, and the button that actually sends is four inches below them.
 *
 */
function RouteTile({ icon, title, detail, on, onClick }: RouteTileProps) {
  return (
    <button
      type="button"
      data-finish-route={title.toLowerCase().replace(/\s+/g, '-')}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-card border p-3 text-left transition-micro max-narrow:min-h-[var(--control-h-touch)]',
        on
          ? 'border-transparent bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
          : 'border-line bg-surface text-ink hover:bg-s2',
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      {/* Two explicit spans in a column. A bare text fragment beside another one
          in a flex container becomes its OWN flex item, which is how a button
          label once rendered as six unreadable pieces at 390px. */}
      <span className="flex flex-col gap-0.5">
        <span className="type-h3">{title}</span>
        <span className={cn('type-meta', on ? 'opacity-75' : 'text-muted')}>{detail}</span>
      </span>
    </button>
  )
}

/**
 * What happens to the post once it is written.
 *
 * ── TWO ROUTES, ASKED AS A QUESTION RATHER THAN STACKED ──────────────────────
 * This panel used to render the schedule picker, the dry run and the per-channel
 * publish rail one under another, always, all of them. Every reader paid the
 * full height of both answers to give one, and the two were only separated by
 * vertical distance, which is the weakest separator there is. A writer who came
 * here to put the post on Thursday scrolled past four live Publish buttons to
 * reach a date field.
 *
 * So the panel asks first. Two large choices, then the controls for the one
 * chosen. Nothing is hidden that a reader has asked for and nothing is offered
 * before it is relevant.
 *
 * ── A STORED TIME OPENS THE SCHEDULE SIDE ON ITS OWN ─────────────────────────
 * A post with `scheduled_at` set IS scheduled — the chip that set it went
 * through `release_post_for_publish` at the moment it was pressed. Opening
 * closed would hide the only control that can move or clear that time, and the
 * reader would have no way to see a commitment their post is already under.
 *
 * ── THERE IS NOW A SINGLE "SEND NOW", AND THE OLD ARGUMENT AGAINST IT ────────
 * This comment used to say a single button was impossible, because one post can
 * be live on Instagram and failed on X in the same second and one verdict cannot
 * cover both. That was right about the REPORT and wrong about the BUTTON. The
 * per-channel truth moved to `send-outcomes.tsx`, which renders one row per
 * channel with its own verdict and its own link and never sums them. So the
 * reader makes one decision and still gets four answers.
 *
 * ── AND BOTH ENDINGS NOW SIT TOGETHER, UNDER THE DRY RUN ─────────────────────
 * Saving used to live in a sticky bar pinned to the window while sending lived
 * here, so the two endings to the same piece of work were in different places
 * and one floated over the other. `SendControls` holds both, below
 * `PublishPreview`, with the channel list above them.
 *
 * ── AND THE DRY RUN STAYS BEFORE THE LIVE ONE ────────────────────────────────
 * The rehearsal comes before the performance, and the two are never merged:
 * `simulatePublish` writes nothing and sends nothing, and it is labelled as a
 * simulation everywhere it reports.
 */
export function FinishPanel({
  postId,
  channels,
  scheduledAt,
  onScheduleChange,
  scheduleError,
  autoPublish,
  connected,
  statusRows,
  flush,
  saveVariantNow,
  saveAllVersions,
  unsavedVersions,
}: FinishPanelProps) {
  const [chosen, setChosen] = useState<Route | null>(null)
  const route = chosen ?? (scheduledAt === null ? null : 'schedule')

  return (
    <section
      id="finish"
      aria-labelledby="finish-heading"
      className="surface-ring scroll-mt-6 space-y-4 rounded-card bg-surface p-4"
    >
      {/* ── ONE HEADING, AND IT IS THIS ONE ──────────────────────────────────
          This briefly took the id of a heading rendered above it, back when the
          three parts were stacked on one page and each carried a numbered
          title — two identical headings read as two sections to anyone moving
          by heading. The rail replaced that: a rail row is navigation, not a
          heading, so the panel names itself again and there is exactly one. */}
      <h2 id="finish-heading" className="type-h2">
        Send it
      </h2>

      <div
        role="group"
        aria-label="How this post goes out"
        className="grid gap-2 narrow:grid-cols-2"
      >
        <RouteTile
          icon={<CalendarClock size={18} strokeWidth={1.8} aria-hidden />}
          title="Schedule it"
          detail="Choose when this goes out."
          on={route === 'schedule'}
          onClick={() => setChosen('schedule')}
        />
        <RouteTile
          icon={<Send size={18} strokeWidth={1.8} aria-hidden />}
          title="Post now"
          // "Send it to one channel right away" was here and is no longer true:
          // one press reaches every connected channel and reports on each.
          detail="Send it to every connected channel right away."
          on={route === 'now'}
          onClick={() => setChosen('now')}
        />
      </div>

      {route === null ? (
        <p className="type-meta text-muted">Nothing goes out until you choose one of these.</p>
      ) : null}

      {route === 'schedule' ? (
        <FinishSchedule
          channels={channels}
          scheduledAt={scheduledAt}
          onScheduleChange={onScheduleChange}
          scheduleError={scheduleError}
          autoPublish={autoPublish}
          connected={connected}
        />
      ) : null}

      {route === 'now' ? (
        <FinishPublish
          postId={postId}
          channels={channels}
          connected={connected}
          statusRows={statusRows}
          flush={flush}
          saveVariantNow={saveVariantNow}
          saveAllVersions={saveAllVersions}
          unsavedVersions={unsavedVersions}
        />
      ) : null}
    </section>
  )
}
