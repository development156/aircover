import Link from 'next/link'

import { AgencyBlade } from '@/components/posts/agency-blade'
import { certaintyFor } from '@/lib/posts/certainty'
import type { DisplayPost } from '@/lib/posts/display-post'
import { outcomeOf } from '@/lib/posts/publish-evidence'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import type { WeekBuckets } from '@/lib/planner/week'
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

const DAY_LABEL = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
})
const DATE_LABEL = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric' })

const CERTAINTY_CLASS: Record<string, string> = {
  real: 'is-real',
  committed: 'is-committed',
  proposed: 'is-proposed',
  simulated: 'is-simulated',
  failed: 'border border-danger bg-transparent text-danger',
  neutral: 'border border-line bg-transparent text-muted',
}

function Entry({ post, variants }: { post: DisplayPost; variants: readonly VariantStatusRow[] }) {
  const certainty = certaintyFor(post.intent, outcomeOf(variants))

  return (
    <Link
      href={`/posts/${post.id}`}
      data-certainty={certainty.level}
      className={cn(
        'flex items-center gap-1.5 rounded-sm px-2 py-1 text-[12px] leading-4 font-semibold transition-micro hover:brightness-95',
        CERTAINTY_CLASS[certainty.level],
      )}
    >
      <AgencyBlade origin={post.origin} />
      <span className="truncate">{post.title?.trim() || 'Untitled post'}</span>
      {/* The hatch alone is not a claim — a simulated entry says so in words. */}
      {certainty.label !== null ? (
        <span className="type-eyebrow shrink-0 text-ink-mute">{certainty.label}</span>
      ) : null}
    </Link>
  )
}

export interface WeekStripProps {
  buckets: WeekBuckets
  /**
   * post id → per-channel publish state. Required in position; an ABSENT entry
   * for one post means unknown, which under-claims rather than denying a
   * publish nobody read.
   */
  variantStates: ReadonlyMap<string, readonly VariantStatusRow[]>
}

export function WeekStrip({ buckets, variantStates }: WeekStripProps) {
  const total = buckets.days.reduce((sum, day) => sum + day.posts.length, 0)

  return (
    <section aria-label="This week" data-guide="home.week">
      <ol className="grid grid-cols-7 gap-2 max-narrow:grid-cols-1 max-narrow:gap-0">
        {buckets.days.map((day, index) => (
          <li
            key={day.key}
            className={cn(
              'min-h-[104px] rounded-lg border border-line bg-surface p-2',
              // Phone: a row per day, not a 40px column. Hairlines instead of
              // seven boxes, so the list reads as one thing.
              'max-narrow:flex max-narrow:min-h-0 max-narrow:items-start max-narrow:gap-3 max-narrow:rounded-none max-narrow:border-0 max-narrow:border-b max-narrow:bg-transparent max-narrow:px-0 max-narrow:py-2.5',
              index === 0 && 'border-brand-tint bg-brand-wash max-narrow:bg-transparent',
            )}
          >
            <p
              className={cn(
                'type-eyebrow mb-2 flex items-baseline gap-1 max-narrow:mb-0 max-narrow:w-16 max-narrow:shrink-0',
                index === 0 ? 'text-brand-text' : 'text-ink-mute',
              )}
            >
              <span>{DAY_LABEL.format(day.date)}</span>
              <span className="num">{DATE_LABEL.format(day.date)}</span>
            </p>
            <div className="space-y-1 max-narrow:min-w-0 max-narrow:flex-1">
              {day.posts.length === 0 ? (
                // Deliberately blank rather than "nothing planned" seven times
                // over: an empty day in a calendar is self-evident, and the
                // repetition would drown the days that DO have something.
                <span className="sr-only">Nothing planned</span>
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
        <p className="mt-3 text-[13px] text-muted">
          Nothing scheduled this week yet. Anything you approve or schedule shows up here.
        </p>
      ) : null}
    </section>
  )
}
