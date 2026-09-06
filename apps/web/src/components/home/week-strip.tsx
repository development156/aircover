import Link from 'next/link'

import { AgencyBlade } from '@/components/posts/agency-blade'
import { CERTAINTY_CLASS, certaintyFor } from '@/lib/posts/certainty'
import type { DisplayPost } from '@/lib/posts/display-post'
import { outcomeOf } from '@/lib/posts/publish-evidence'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import type { WeekBuckets } from '@/lib/planner/week'
import { HomeSection } from '@/components/home/section'
import { cn } from '@/lib/utils'

/**
 * The week, at a glance. Home's centrepiece.
 *
 * This has to be readable WITHOUT reading — the whole point of the Certainty
 * System. Each entry carries its structural signature (solid / hairline / dash /
 * hatch), so the shape of the week is legible before any word is, and stays
 * legible under a tenant's Brand Skin, in greyscale, and to a colourblind user.
 *
 * Expect mostly COMMITTED and PROPOSED. `.is-real` needs a channel that is live
 * on a real platform; a post with none renders committed, which under-claims
 * rather than lying. That contrast — a few firm things among many dashed ones —
 * is the honest picture of a week that is mostly planned and partly done, and it
 * is what the strip is for.
 *
 * This strip read `posts.status` through `certaintyFor` and had no variant data
 * at all, so a post that genuinely went out could never show as real here. Home
 * now reads the rows and passes them down — see `publish-evidence.ts`.
 *
 * PHONE TREATMENT, not a squeeze. Seven columns at 375px would be 40px wide and
 * unreadable, so below the narrow breakpoint the strip becomes a vertical list:
 * one row per day, label left, entries right. Same information, same order, a
 * shape that fits the hand.
 */

/**
 * The day labels are read in the WORKSPACE'S zone — the same one `bucketWeek`
 * keyed the days by — so a label and the posts under it cannot disagree. Built
 * per zone and cached, because the zone is a per-workspace fact.
 */
const LABEL_CACHE = new Map<string, { day: Intl.DateTimeFormat; date: Intl.DateTimeFormat }>()

function labels(zone: string) {
  let f = LABEL_CACHE.get(zone)
  if (!f) {
    f = {
      day: new Intl.DateTimeFormat('en-IN', { timeZone: zone, weekday: 'short' }),
      date: new Intl.DateTimeFormat('en-IN', { timeZone: zone, day: 'numeric' }),
    }
    LABEL_CACHE.set(zone, f)
  }
  return f
}

function Entry({ post, variants }: { post: DisplayPost; variants: readonly VariantStatusRow[] }) {
  const certainty = certaintyFor(post.intent, outcomeOf(variants))
  const title = post.title?.trim() || 'Untitled post'

  return (
    <Link
      href={`/posts/${post.id}`}
      data-certainty={certainty.level}
      // A cell is ~110px at 1440 and the title truncates to about ten
      // characters (MEASURED 2026-09-06 with a 200-character title). The
      // tooltip is the cheapest way to keep the rest of the sentence reachable
      // without widening the calendar.
      title={title}
      className={cn(
        'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-sm px-2.5 py-1.5 type-meta font-semibold transition-micro',
        // HOVER IS A GLOW, NOT A BRIGHTNESS FILTER. `hover:brightness-95` was
        // multiplicative: on a near-white chip in light it moved the fill by 5%
        // and was invisible, and it dimmed the TEXT along with the fill, so
        // hovering a chip LOWERED its contrast. A brand glow reads in both
        // themes, leaves the certainty ladder's ink coverage untouched, and
        // cannot reduce legibility.
        'hover:shadow-brand',
        // The touch floor (docs/37 §13). These are links, so they are
        // interactive controls and must reach 44px at narrow widths. MEASURED
        // at 26px before this line, at every width.
        'max-narrow:min-h-[44px] max-narrow:px-3',
        CERTAINTY_CLASS[certainty.level],
      )}
    >
      <AgencyBlade origin={post.origin} />
      {/* `min-w-0` is what lets the title truncate instead of forcing the row
          wide, and `flex-1` is what makes it claim the space before the label
          does. Without the pair, the required simulated label starved the title
          down to a single character plus an ellipsis. */}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {/* The hatch alone is not a claim — a simulated entry says so in words.
          `narrow:basis-full` gives it its OWN LINE from 700px up, where the strip
          is seven columns and a column is ~145px: sharing that line, the label
          starved the title to `S...`. Below 700 the strip is a list and each row
          is full width, so there it stays inline.

          `flex-wrap` alone did NOT fix this and the frame is what proved it —
          `flex-1` lets the title shrink to zero and truncate, so the row always
          "fits" and the wrap never fires. The measurement said h=30 (one line)
          and agreed with the frame; the earlier reading was mine, not the
          instrument's. */}
      {certainty.label !== null ? (
        <span className="type-eyebrow shrink-0 text-ink-mute narrow:basis-full">
          {certainty.label}
        </span>
      ) : null}
    </Link>
  )
}

export interface WeekStripProps {
  buckets: WeekBuckets
  /** The workspace's zone: the one `buckets` were keyed in. */
  zone: string
  /**
   * post id → per-channel publish state. Required in position; an ABSENT entry
   * for one post means unknown, which under-claims rather than denying a
   * publish nobody read.
   */
  variantStates: ReadonlyMap<string, readonly VariantStatusRow[]>
}

export function WeekStrip({ buckets, variantStates, zone }: WeekStripProps) {
  const { day: dayLabel, date: dateLabel } = labels(zone)
  const total = buckets.days.reduce((sum, day) => sum + day.posts.length, 0)

  return (
    /* ── IT IS IN THE PAGE'S CARD LANGUAGE NOW ────────────────────────────────
       This rendered seven bordered day tiles on the bare page ground, with an
       `aria-label` and no heading — so the one region of Home that answers
       "what is scheduled" had no title on screen and none in the document
       outline either, and it was the only block on the page not sitting in a
       card. Seven boxes floating below two carded regions is what made the
       bottom of the page read as loose parts.

       The days keep their own borders: inside the card they are a calendar's
       cells, which is a grid of seven things and genuinely wants its edges. */
    <HomeSection
      id="home-week"
      title="This week"
      guide="home.week"
      action={{ href: '/planner', label: 'Open Planner' }}
    >
      <ol className="grid grid-cols-7 gap-2.5 max-narrow:grid-cols-1 max-narrow:gap-0">
        {buckets.days.map((day, index) => (
          <li
            key={day.key}
            aria-current={index === 0 ? 'date' : undefined}
            className={cn(
              // p-3 rather than p-2, and that also makes the radius ladder correct
              // rather than coincidental: tokens.css:305 sets a nested surface's
              // radius at the parent's MINUS the gap, and 24px card - 12px pad is
              // the 12px (--r-sm) the chips already carry.
              'min-h-[116px] rounded-card border border-line bg-surface p-3',
              // Phone: a row per day, not a 40px column. Hairlines instead of
              // seven boxes, so the list reads as one thing.
              'max-narrow:flex max-narrow:min-h-0 max-narrow:items-start max-narrow:gap-3 max-narrow:rounded-none max-narrow:border-0 max-narrow:border-b max-narrow:bg-transparent max-narrow:px-0 max-narrow:py-2.5',
              // TODAY. --brand-tint (orange 16%) measured 1.19:1 against the card
              // in light, which is an edge nobody can see; --brand-lift (40%) is
              // the same token .is-committed already uses for its ring, and
              // measures 1.57:1. Still short of the 3:1 a UI boundary wants, and
              // that shortfall is a TOKEN fact, not this component's - see the
              // handoff. The wash carries the rest of the signal.
              index === 0 && 'border-brand-lift bg-brand-wash max-narrow:bg-transparent',
            )}
          >
            <p
              className={cn(
                'type-eyebrow mb-2.5 flex items-baseline gap-1 max-narrow:mb-0 max-narrow:w-16 max-narrow:shrink-0',
                // `text-ink`, not `text-brand-text`: MEASURED 2.94:1 on the
                // brand wash at 11px, below AA. The wash and the ring carry
                // "today"; the label carries the day, in ink.
                index === 0 ? 'text-ink' : 'text-ink-mute',
              )}
            >
              <span>{dayLabel.format(day.date)}</span>
              <span className="num">{dateLabel.format(day.date)}</span>
            </p>
            <div className="space-y-1.5 max-narrow:min-w-0 max-narrow:flex-1">
              {day.posts.length === 0 ? (
                // Deliberately blank rather than "nothing planned" seven times
                // over: an empty day in a calendar is self-evident, and the
                // repetition would drown the days that DO have something.
                <span className="sr-only">Nothing set</span>
              ) : (
                day.posts.map((post) => (
                  <Entry key={post.id} post={post} variants={variantStates.get(post.id) ?? []} />
                ))
              )}
            </div>
          </li>
        ))}
      </ol>
      {total === 0 ? (
        <p className="mt-3 type-sm text-muted">
          Nothing set to go out this week yet. Posts you approve or schedule show up here.
        </p>
      ) : null}
    </HomeSection>
  )
}
