import Link from 'next/link'
import type { Channel, Post } from '@sahoda/shared'

import { ChannelCell } from '@/components/campaigns/channel-cell'
import { RemovePostButton } from '@/components/campaigns/remove-post-button'
import { CHANNEL_LABELS, CHANNEL_SHORT } from '@/components/posts/channel-label'
import { StatusBadge } from '@/components/posts/status-badge'
import { campaignRowCells, type CampaignCell, type VariantsRead } from '@/lib/campaigns/cell'
import { outcomeOf } from '@/lib/posts/publish-evidence'

/**
 * THE CAMPAIGN GRID — posts down, channels across.
 *
 * ── WHY THIS IS A GRID AND NOT A LIST OF CARDS ───────────────────────────────
 * The reader of this screen is comparing values ACROSS records: is the Diwali
 * teaser out on Instagram while the menu photo is still waiting? That question
 * is answered by scanning a column, and a column is a table. Eight posts as
 * eight equal-weight cards is the failure `/posts` was written up for.
 *
 * ── AND WHY THE COLUMNS ARE CHANNELS ─────────────────────────────────────────
 * Because one post is not one thing. Instagram's caption is not LinkedIn's, each
 * has its own row in `post_variants`, each publishes on its own, and each can
 * fail while the others go out. Every competing tool collapses that into one
 * status per post. Giving each channel a column is the same fact, drawn — and it
 * means the screen cannot lie about it later, because there is nowhere to put a
 * single collapsed answer.
 *
 * ── THE FIRST CELL OF EACH ROW IS A `th`, WHICH IS WHY THIS IS NOT DataTable ──
 * `DataTable` renders every body cell as `td`. In a matrix the row's own label
 * is a HEADER for that row, and without `scope="row"` a screen reader reading
 * cell 3 of row 4 announces the column but not which post it belongs to — the
 * grid becomes unnavigable exactly where it is most useful. That is the only
 * reason this does not reuse the primitive.
 */
export function CampaignGrid({
  posts,
  columns,
  variants,
  campaignId,
}: {
  posts: readonly Post[]
  columns: readonly Channel[]
  variants: VariantsRead
  campaignId: string
}) {
  const rows = posts.map((post) => ({
    post,
    cells: campaignRowCells(post, columns, variants),
    // The post-level chip, from the same evidence the cells use. On the
    // `unreadable` arm it is given no rows, which reports `unknown` and makes
    // the chip fall back to intent rather than claiming anything.
    outcome: outcomeOf(variants.status === 'ok' ? (variants.byPost.get(post.id) ?? []) : []),
  }))

  return (
    // The grid scrolls INSIDE its own box. At 390px five columns cannot fit, and
    // the alternative — a second stacked rendering behind `max-narrow:hidden` —
    // would put every post's name in the accessibility tree twice.
    //
    // ── `relative` IS LOAD-BEARING AND WAS FOUND BY MEASUREMENT ──────────────
    // Without it this page scrolled sideways 34px at 390px: the table's
    // scrollable overflow reached the VIEWPORT instead of stopping at this box,
    // so the whole layout — topbar and bottom bar included — slid left and left
    // a band of dead space. MEASURED in a real browser at 390px:
    // `window.scrollTo(9999,0)` moved the document by 34px, and hiding this one
    // box took it to 0 while `/home` measured 0 throughout.
    //
    // The one-line fix was found by bisection, not by reasoning: `overflow: auto`
    // on both axes, `overflow-y: hidden`, `contain: inline-size`, a `minmax(0,1fr)`
    // grid parent and `max-width: 100%` all left it at 34. `position: relative`
    // on this box alone took it to 0 while the box still scrolled internally by
    // 73px, which is the property that must survive.
    //
    // It is NOT needed on `DataTable`, which has the same class list: forcing a
    // header wide enough to overflow that primitive left the page at 0. The
    // difference is this table's `max-w-[280px]` row header, whose intrinsic
    // contribution is what escapes. Recorded because "add relative to every
    // scroll box" would be cargo-culting a fix whose cause is narrower.
    <div className="relative overflow-x-auto rounded-card border border-line-soft">
      <table className="w-full border-collapse">
        <caption className="sr-only">
          Every post in this campaign, and what each one is doing on each channel
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="type-eyebrow border-b border-line-soft px-3 py-2 text-left text-muted"
            >
              Post
            </th>
            {columns.map((channel) => (
              <th
                key={channel}
                scope="col"
                className="type-eyebrow border-b border-line-soft px-3 py-2 text-left whitespace-nowrap text-muted"
              >
                {/* Short name on screen — Google Business Profile's real name
                    is 24 characters and would set the column width for the whole
                    table — with the full name added for a screen reader ONLY
                    where the two differ. Adding it unconditionally makes a
                    screen reader announce "Instagram Instagram" on three of the
                    four columns, which is noise dressed as accessibility. */}
                {CHANNEL_SHORT[channel] === CHANNEL_LABELS[channel] ? (
                  CHANNEL_SHORT[channel]
                ) : (
                  <>
                    <span aria-hidden>{CHANNEL_SHORT[channel]}</span>
                    <span className="sr-only">{CHANNEL_LABELS[channel]}</span>
                  </>
                )}
              </th>
            ))}
            <th scope="col" className="border-b border-line-soft px-3 py-2">
              <span className="sr-only">Remove from this campaign</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ post, cells, outcome }) => (
            <tr key={post.id} className="border-b border-line-soft last:border-0 hover:bg-s2">
              <th scope="row" className="max-w-[280px] px-3 py-2.5 text-left font-normal">
                <Link
                  href={`/posts/${post.id}`}
                  className="type-h3 block truncate hover:underline"
                  title={post.title?.trim() || 'Untitled post'}
                >
                  {post.title?.trim() || 'Untitled post'}
                </Link>
                <span className="mt-1 inline-flex">
                  <StatusBadge intent={post.status} outcome={outcome} />
                </span>
              </th>
              {cells.map((cell: CampaignCell) => (
                <td key={cell.channel} className="px-3 py-2.5 align-top">
                  <ChannelCell cell={cell} />
                </td>
              ))}
              <td className="px-3 py-2.5 text-right align-top">
                <RemovePostButton
                  campaignId={campaignId}
                  postId={post.id}
                  postTitle={post.title?.trim() || 'Untitled post'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
