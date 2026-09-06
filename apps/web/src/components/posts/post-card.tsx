import Link from 'next/link'
import { CalendarClock } from 'lucide-react'

import { AgencyBlade } from '@/components/posts/agency-blade'
import { AutoPublishNote } from '@/components/posts/auto-publish-note'
import { LiveChannelChips } from '@/components/posts/live/live-channel-chips'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { DeletePostButton } from '@/components/posts/delete-post-button'
import { MediaPeek, type MediaPeekItem } from '@/components/posts/media-peek'
import { MetricStrip } from '@/components/posts/metric-strip'
import { LiveStatusBadge } from '@/components/posts/live/live-status-badge'
import type { ChannelMetrics } from '@/lib/analytics/post-metrics'
import { Card } from '@/components/ui/card'
import type { DisplayPost } from '@/lib/posts/display-post'
import { formatScheduledAt } from '@/lib/posts/schedule-format'
import { bodyAfterFirstLine, displayTitleOf } from '@/lib/posts/display-title'
import { relativeAge } from '@/lib/ops/session-pulse'
import { cn } from '@/lib/utils'

/**
 * One post in the list. Server component — the only client islands inside it
 * are the delete control and the live chips, so the card itself costs no JS.
 *
 * ── THE CARD IS NO LONGER ONE BIG <Link> ─────────────────────────────────────
 * It used to wrap everything from the title to the metric strip in a single
 * anchor, and that produced two problems that a stretched link fixes together.
 *
 * 1. NESTED ANCHORS. `ChannelChip` renders a real `<a>` to the platform
 *    permalink, INSIDE that wrapper. The click was handled — the chip calls
 *    `stopPropagation` — but an `<a>` inside an `<a>` is invalid HTML, and the
 *    HTML parser reparents the inner one out of the outer during parsing. That
 *    is a server-rendered document, so the DOM the browser builds is not the
 *    tree React described, and what assistive tech does with it is undefined.
 *
 * 2. NOWHERE TO PUT ANYTHING ELSE. Every interactive control had to live
 *    OUTSIDE the anchor, which is why `Delete` ended up in a footer of its own,
 *    below a full-width rule, as the only action on the card with dedicated
 *    space (docs/26 §1.5, docs/27 §1). There was literally no other slot.
 *
 * So the TITLE is the link now, and it stretches over the card with
 * `after:absolute after:inset-0`. Everything interactive is a SIBLING at
 * `relative z-10`, sitting above that pseudo-element: the chips reach their
 * permalinks, delete reaches its confirm, and the card still opens the editor
 * from any dead space. One anchor per card, valid markup, and a place to put
 * an action that is not a footer.
 */

const EXCERPT_MAX_CHARS = 220

function excerptOf(body: string | null): string | null {
  const trimmed = body?.trim()
  if (!trimmed) return null
  // Sliced by CODE POINT, not UTF-16 unit — the same unit `charCountFor` counts
  // in. A plain `.slice()` cuts an emoji in half when the boundary lands between
  // its surrogates and renders a replacement char.
  const chars = Array.from(trimmed)
  if (chars.length <= EXCERPT_MAX_CHARS) return trimmed
  return `${chars.slice(0, EXCERPT_MAX_CHARS).join('').trimEnd()}…`
}

export interface PostCardProps {
  /**
   * Render as a small square tile for the grid instead of a full-width row.
   *
   * ── A FLAG, NOT A SECOND CARD ────────────────────────────────────────────
   * Forking this into `PostTile` would have duplicated the stretched-link
   * construction the long comment above exists to explain, the live badge, the
   * delete control and the excerpt derivation — four things that were each got
   * wrong once already. A copy is four more places for them to drift.
   *
   * What actually differs is layout: the tile is a fixed-ratio column with the
   * meta pinned to its floor, and it clips. NOTHING is removed. A tile that
   * quietly dropped the schedule or the metric strip would be a different
   * claim about the same post depending on which screen you opened.
   */
  compact?: boolean
  /**
   * Whether the scheduled dispatcher is on in this environment (server fact from
   * `autoPublishEnabled()`). Defaults false so a forgotten call site under-promises
   * rather than claiming an auto-publish that will not happen.
   */
  autoPublish?: boolean
  post: DisplayPost
  /**
   * Per-channel publish state, batched for the whole page by `listVariantStates`.
   *
   * Required in position. It used to be optional, which was survivable while it
   * only fed the auto-publish note; now it is the sole evidence behind the
   * status chip, and a call site that forgot it would get `unknown` and quietly
   * fall back to the stale intent word — the defect this card was changed to fix.
   * Pass `[]` to mean "no rows".
   */
  variantStates: readonly VariantStatusRow[]
  /**
   * Per-channel metrics, batched for the whole page by `listPostMetrics`.
   *
   * Absent means the page did not ask (no workspace, no key) — which renders
   * nothing rather than zeroes, the same rule the strip itself follows.
   */
  metrics?: readonly ChannelMetrics[]
  /**
   * Photos attached to this post, already signed by the page.
   *
   * Absent and empty mean the same thing HERE and deliberately so: the card
   * renders nothing either way, because "no photo" and "the page did not ask"
   * both leave the tile with nothing honest to draw. The distinction that DOES
   * matter — a photo that exists and could not be fetched — is carried inside
   * each item as a null url, and `MediaPeek` marks it rather than hiding it.
   */
  media?: readonly MediaPeekItem[]
  /** One instant for the whole list, read on the server. See `AutoPublishNote`. */
  now: Date
}

export function PostCard({
  autoPublish = false,
  compact = false,
  post,
  now,
  variantStates,
  metrics,
  zone,
  media = [],
}: PostCardProps & { zone?: string | null }) {
  const heading = displayTitleOf(post)
  const displayTitle = heading.text
  const hasBody = Boolean(post.body?.trim())
  // When the heading IS the body's first line, the excerpt starts at the SECOND
  // line — otherwise the card prints the same sentence twice.
  const excerpt = excerptOf(
    heading.source === 'derived' ? bodyAfterFirstLine(post.body) : post.body,
  )
  const savedAge = relativeAge(post.updated_at, now)
  const scheduledAt = formatScheduledAt(post.scheduled_at, zone)
  // Distinct already: `post.channels` is a `ChannelSet`, deduplicated once when
  // the row was parsed. `posts.channels` is still a bare `text[]` with no unique
  // constraint, so a repeated value is storable — it just cannot survive the read.
  // This used to de-dupe here, one of four component-local copies of the same
  // three characters, and the copies are what let the bug keep moving.
  const channels = post.channels

  return (
    // `group` drives the title hover. The focus ring is deliberately left to the
    // global `:focus-visible` rule in globals.css (the 2px --acc a11y floor):
    // the link below is `block`, so it already spans the card's whole content
    // area and the stock ring lands in the right place. No bespoke ring utility
    // here — an unverified colour utility that fails to compile would delete the
    // ring silently.
    <Card
      interactive
      className={cn(
        'group relative hover:shadow-pop active:translate-y-0',
        // ── THE SQUARE IS A FLOOR, NOT A CAGE ────────────────────────────────
        // `narrow:` and not `sm:` — this app clears Tailwind's default
        // breakpoints to `initial` and defines two of its own, so `sm:` is a
        // class that matches nothing and the square would never appear. The
        // ratio also begins where the grid actually HAS columns: a square on a
        // one-column phone layout is a ~360px tall tile holding three lines of
        // text, which is worse than the row it replaced.
        //
        // ── AND IT DELIBERATELY DOES NOT CLIP ────────────────────────────────
        // This carried `overflow-hidden` for one revision, on the reasoning that
        // a fixed ratio should own its box. MEASURED in Chromium at a 310px
        // tile, that combination did two things the reasoning did not predict:
        //
        //   1. The excerpt has `line-clamp`, which sets `overflow: hidden`, which
        //      gives a flex item an automatic minimum size of ZERO. It was the
        //      only shrinkable thing in the column, so it absorbed the whole
        //      deficit and collapsed to h=0 — the body preview DELETED, with no
        //      ellipsis and no trace, on exactly the busy posts worth previewing.
        //   2. `MetricStrip` has visible overflow, so it could not shrink. It
        //      overflowed instead and the card sliced it: a third channel's row
        //      cut to nothing, and an impression count rendered at 80% of its
        //      line height — a real number cut horizontally through the digits.
        //
        // A half-drawn figure about someone's business is the one thing this
        // product may never render, so the ratio yields instead. `aspect-square`
        // with `min-h-0` unset sizes the tile from its width when the content
        // fits and lets it grow when it does not; grid rows stretch their
        // siblings to match, so the grid stays a grid. Tiles are square in the
        // ordinary case and honest in the rest.
        // `wide:` and not `narrow:`. The ratio used to begin at 700px, where
        // the grid has TWO columns — MEASURED in Chromium at 1024px: two 478px
        // columns, so each tile is a 478x478 square and the eight before the
        // fold run 1996px down the page. That is more than two screens, on a
        // common laptop width, for a change whose whole point is that eight fit
        // on one. The square is worth having only where the grid is four wide.
        // Between 700 and 1179 the tiles are two-up rectangles that take their
        // height from their content, which is still far shorter than the
        // full-width rows they replaced.
        //
        // `h-full` because the stretch stops at the grid item. `StaggerItem`
        // renders a plain div between the <li> and this Card, so without it a
        // row sized by its tallest tile leaves the others short — MEASURED at
        // 1180: 365px items holding 268px cards, 97px of dead space under six
        // of the eight, and those six not square either.
        compact && 'flex h-full flex-col p-4 wide:aspect-square',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* The blade sits with the TITLE, never with the status chip: it says
            Sahoda drafted this post, and placing it beside a publish claim
            would read as "Sahoda published it" — which no column records.

            `type-h3` (15px), not the hand-written 17px bold this carried.
            docs/26 §5 exists because card titles were written by hand at each
            call site and drifted; §3.4 is why the density had to come down —
            eight of these ran ~197px each for three lines of content. */}
        <h2
          className={cn(
            // `min-w-0` and `break-words`: a flex item's automatic minimum is
            // its CONTENT, so a title with no space in it (titles derive from
            // the body's first line, and a pasted link is one) refuses to
            // shrink and the card paints over its neighbour. MEASURED before
            // this: 63px of overspill at 1440 and 128px at 1180.
            'type-h3 flex min-w-0 items-center gap-2 transition-micro group-hover:text-accent',
            heading.source === 'none' && 'font-semibold text-muted',
          )}
        >
          <AgencyBlade origin={post.origin} />
          {/* The stretched link. One anchor per card; the pseudo-element makes
              the whole card a target without wrapping anything in an <a>. */}
          <Link
            href={`/posts/${post.id}`}
            data-guide="posts.card"
            className="min-w-0 break-words rounded-input after:absolute after:inset-0 after:rounded-card after:content-['']"
          >
            {displayTitle}
          </Link>
        </h2>
        <div className="relative z-10 flex flex-none items-center gap-1">
          {/* Live: a publisher can move this row while the list is open, and
              the badge is the first place that shows. Intent and evidence travel
              together — see `live-status-badge.tsx`. */}
          <LiveStatusBadge postId={post.id} intent={post.intent} variants={variantStates} />
          {/* Icon-only. The row keeps the control and loses the standing verb;
              the accessible name still reads "Delete {title}". */}
          <DeletePostButton
            postId={post.id}
            title={displayTitle}
            compact
            // A PERMALINK is the evidence, not the intent. `post.intent` says
            // what the author committed to; a permalink is the platform's own
            // receipt that something is actually out there — the same rule
            // `variant-status.ts` states for this field ("its presence is what
            // makes it real"). The dialog uses this to decide whether deleting
            // here leaves a live post standing somewhere else, and a claim that
            // strong has to rest on evidence rather than on a status column.
            // A `published` status with no link is deliberately NOT called live
            // (see `channel-chip.tsx`), so it must not warn here either.
            liveElsewhere={variantStates.some((row) => row.permalink)}
          />
        </div>
      </div>

      {/* A one-line body promoted to the heading leaves NOTHING here — and that
          is right: the card is not empty, the heading carries the content.
          "No content written yet." is a claim about the row, reserved for a post
          that genuinely has no body, which is the only case the row supports. */}
      {excerpt ? (
        <p
          className={cn(
            'type-body mt-2 text-muted',
            // `shrink-0` because `line-clamp` implies `overflow: hidden`, which
            // hands a flex item a zero automatic minimum. Without this the clamp
            // is not a clamp — the paragraph collapses out of existence rather
            // than showing its three lines. See the card comment above.
            compact ? 'line-clamp-3 shrink-0' : 'line-clamp-2',
          )}
        >
          {excerpt}
        </p>
      ) : hasBody ? null : (
        <p className="type-body mt-2 text-muted">No content written yet.</p>
      )}

      {/* z-10: these carry the platform permalinks and must sit ABOVE the
          title's stretched pseudo-element to be clickable at all. */}
      <div
        className={cn(
          'relative z-10 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px]',
          // The meta sits on the tile's floor rather than floating under a short
          // excerpt, so eight tiles read as a grid instead of eight ragged boxes.
          compact && 'mt-auto pt-3',
        )}
      >
        <MediaPeek items={media} postTitle={displayTitle} />

        {channels.length > 0 ? (
          /* Live: this is where the platform link appears, the moment the
               permalink lands on the variant row. */
          <LiveChannelChips
            postId={post.id}
            channels={channels}
            initialRows={variantStates}
            className="flex flex-wrap items-center gap-1.5"
          />
        ) : (
          <span className="text-muted">No channels picked yet</span>
        )}

        {scheduledAt ? (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <CalendarClock size={14} strokeWidth={1.8} aria-hidden />
            <span className="tabular-nums">{scheduledAt}</span>
          </span>
        ) : null}

        {/* "Saved", never "Edited": `updated_at` is `default now()` on INSERT as
            well as trigger-written on update, so "Edited" would be false for a
            draft nobody has touched since it was created. */}
        {savedAge ? (
          <span className="text-muted">
            Saved <span className="tabular-nums">{savedAge}</span>
          </span>
        ) : null}
      </div>

      {/* Directly under the badge and the time it qualifies — the two things
            that together read as "this goes out on its own". */}
      <AutoPublishNote
        intent={post.intent}
        scheduledAt={post.scheduled_at}
        now={now}
        variants={variantStates}
        autoPublish={autoPublish}
        className="mt-2"
      />

      {/* Below the publish claim, because a metric only means anything once the
          post is out — and above the fold of the card, because "how did it do"
          is the question this screen gets opened for. */}
      <MetricStrip metrics={metrics ?? []} className="mt-3" />
    </Card>
  )
}
