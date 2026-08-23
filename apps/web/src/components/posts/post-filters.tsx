import Link from 'next/link'
import type { Route } from 'next'
import type { PostStatus } from '@sahoda/shared'

import { rungFor } from '@/lib/posts/rung'
import { cn } from '@/lib/utils'

/**
 * The filter row on /posts.
 *
 * ── WHY THE LIST NEEDED ONE ──────────────────────────────────────────────────
 * MEASURED (docs/27 §1): eight posts occupied ~1,800px as eight identical
 * stacked cards of equal visual weight, with no table, no sort, no filter, no
 * grouping and no bulk select. Nothing on the screen answered "which of these
 * needs me" except reading all eight.
 *
 * ── WHY IT FILTERS BY RUNG, NOT BY STATUS ────────────────────────────────────
 * There are ten `PostStatus` values and nobody thinks in ten. `STATUS_RUNG`
 * already answers the question people actually ask — how much does this need me
 * right now — so these buckets are built on it rather than on a second,
 * competing grouping invented here. `Needs you` IS rung `urgent`: review,
 * failed and partial, by the ladder's own definition.
 *
 * ── THEY ARE LINKS ───────────────────────────────────────────────────────────
 * docs/26 §10.2: every tab here changes the URL, so it is a link. A link opens
 * in a new tab on cmd-click, appears in the page's link list and survives a
 * reload; `router.push` from a button does none of that.
 *
 * ── THE COUNTS ARE OF THIS PAGE, AND SAY SO ──────────────────────────────────
 * `readPosts` is capped at LIST_LIMIT with no pagination. These counts are of
 * the posts actually loaded, which is the only set that can be counted without
 * a second query — so the page's existing cap note is what keeps them honest.
 * A count is never rendered for a bucket that is empty AND unselected, because
 * a permanent "0" invites the reader to believe a filter is broken.
 */

export interface PostFilter {
  slug: string
  label: string
  match: (intent: PostStatus) => boolean
}

export const POST_FILTERS: readonly PostFilter[] = [
  { slug: 'all', label: 'All', match: () => true },
  // The ladder's own rung 1. Not a second opinion about what is urgent.
  { slug: 'needs-you', label: 'Needs you', match: (i) => rungFor(i) === 'urgent' },
  {
    slug: 'scheduled',
    label: 'Scheduled',
    match: (i) => i === 'approved' || i === 'scheduled' || i === 'publishing',
  },
  // `partial` is deliberately NOT here. It is live on one channel and refused on
  // another, so filing it under "Published" would state an outcome for the
  // channels that never went out. It sits in `Needs you`, where the decision is.
  { slug: 'published', label: 'Published', match: (i) => i === 'published' },
  { slug: 'drafts', label: 'Drafts', match: (i) => i === 'draft' || i === 'idea' },
]

export function filterFor(slug: string | undefined): PostFilter {
  return POST_FILTERS.find((f) => f.slug === slug) ?? POST_FILTERS[0]!
}

export function PostFilters({
  active,
  counts,
}: {
  active: string
  /** Real counts over the loaded page, keyed by filter slug. */
  counts: Readonly<Record<string, number>>
}) {
  return (
    <nav aria-label="Filter posts" className="flex flex-wrap items-center gap-2">
      {POST_FILTERS.map((f) => {
        const selected = f.slug === active
        const count = counts[f.slug] ?? 0
        return (
          <Link
            key={f.slug}
            href={(f.slug === 'all' ? '/posts' : `/posts?filter=${f.slug}`) as Route}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-[550] transition-micro max-narrow:min-h-[44px]',
              selected
                ? // ── AN INK FILL, NOT A BRAND FILL, AND THAT IS THE RATION ──
                  // This was `bg-primary text-primary-foreground`: a correct,
                  // accessible pair (black on orange, 7.15:1) that was
                  // nonetheless the SECOND solid brand fill on a screen that
                  // already has "Create post". docs/37 §2.3 allows exactly one
                  // per view, and a filter is navigation rather than the action
                  // the page exists for — so the one is the action.
                  //
                  // `ChannelPicker` reached the same conclusion independently
                  // and wrote it down: "an orange selected state paints up to
                  // four oranges on one screen". Matching its treatment exactly
                  // means the two selectable-pill controls in this product read
                  // as siblings, which is the other half of what a system is
                  // for. A third invented treatment would not be.
                  //
                  // The pair still carries its own contrast in both themes:
                  // --ink is #000 in light and #fff in dark, so the foreground
                  // is stated for each rather than inherited (§10 — pairing
                  // --ink with a fill that does not follow the theme is the most
                  // common way a dark-mode bug ships).
                  'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                : 'text-muted hover:bg-s2 hover:text-ink',
            )}
          >
            {f.label}
            {count > 0 || selected ? (
              <span className="num text-[11px] opacity-70">{count}</span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
