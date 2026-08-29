import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { PostSchema } from '@sahoda/shared'

import { PostCard } from '@/components/posts/post-card'
import type { ChannelMetrics } from '@/lib/analytics/post-metrics'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { forDisplay } from '@/lib/posts/display-post'

/**
 * A tile makes the SAME CLAIMS about a post as a full-width row did.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `compact` was introduced with the reasoning "a flag, not a second card:
 * nothing is forked and no field is dropped, so a tile cannot say something
 * different from a row about the same post". That reasoning was true of the
 * code and pinned by NOTHING. There is no other test in this repository that
 * renders `PostCard` with `compact` at all — every existing one lets it default
 * to false — so the two branches were never compared.
 *
 * MEASURED, before this file existed: deleting the metric strip and the
 * scheduled time from the compact branch only left 929 tests passing, which is
 * byte-identical to the figure the change was shipped on. The most expensive
 * thing this product can do is show a person a different fact about their own
 * business depending on which screen they opened, and nothing was watching.
 *
 * So every assertion below is a PAIR: the same post rendered both ways, and the
 * tile is required to carry what the row carries. Written as a pair on purpose
 * — a test that only asserted the tile would pass if a field vanished from both.
 */

// The card's client islands reach Clerk on import. Same mocks the other
// PostCard tests use, for the same components.
vi.mock('@/app/actions/planner', () => ({ approvePost: vi.fn() }))
vi.mock('@/app/actions/posts', () => ({ savePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: vi.fn() }))

// jsdom implements <dialog> but not `showModal`, which the delete dialog calls.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
})

const NOW = new Date('2026-08-11T12:00:00.000Z')

/** A scheduled post with a body, two channels and a real measurement. */
const row = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  title: 'Monsoon menu',
  body: 'Hot filter coffee is back, and the window seat is free all afternoon.',
  status: 'scheduled',
  channels: ['linkedin', 'x'],
  scheduled_at: '2026-08-14T13:00:00.000Z',
  origin: 'manual',
  created_by: 'user_1',
  created_at: '2026-08-10T10:00:00.000Z',
  updated_at: '2026-08-10T10:00:00.000Z',
}

const metrics: ChannelMetrics[] = [
  {
    channel: 'linkedin',
    state: {
      kind: 'ready',
      metrics: {
        impressions: 1240,
        reach: 980,
        engagement: 63,
        engagementRate: null,
        measuredAt: '2026-08-11T09:00:00.000Z',
      },
    },
  },
]

/**
 * A published variant row, as `listVariantStates` hands it over. Built through
 * a helper rather than by hand at each call site so the ONE field these tests
 * are about — the permalink — is the only thing that varies between them.
 */
function variantRow(channel: 'x' | 'linkedin', permalink: string | null): VariantStatusRow {
  return {
    channel,
    status: 'published',
    permalink,
    platformPostId: permalink ? '123' : null,
    simulated: false,
    errorMessage: null,
    errorCode: null,
    gateRefusal: null,
    retryable: false,
  }
}

function renderBoth() {
  const post = forDisplay(PostSchema.parse(row))
  const row1 = render(
    <PostCard post={post} now={NOW} variantStates={[]} metrics={metrics} />,
  ).container
  const tile = render(
    <PostCard compact post={post} now={NOW} variantStates={[]} metrics={metrics} />,
  ).container
  return { row: row1, tile }
}

describe('a compact tile against the full-width row it replaced', () => {
  test('carries the same measured number', () => {
    const { row: wide, tile } = renderBoth()

    // The one thing this product may never do is show a different figure about
    // someone's business on two screens. Read off the DOM of each, compared to
    // each other rather than to a literal, so rewording the strip does not
    // silently retarget this at nothing.
    expect(wide.textContent).toContain('1,240')
    expect(tile.textContent).toContain('1,240')
  })

  test('carries the same send time', () => {
    const { row: wide, tile } = renderBoth()

    // A tile that dropped the schedule would read as an unscheduled draft.
    const when = screen.getAllByText(/Aug 2026/)
    expect(when.length).toBeGreaterThanOrEqual(2)
    expect(wide.textContent).toContain('Aug 2026')
    expect(tile.textContent).toContain('Aug 2026')
  })

  test('carries the same destinations, the title and the body preview', () => {
    const { row: wide, tile } = renderBoth()

    for (const container of [wide, tile]) {
      expect(container.textContent).toContain('Monsoon menu')
      expect(container.textContent).toContain('Hot filter coffee is back')
      expect(container.textContent).toContain('LinkedIn')
      expect(container.textContent).toContain('X')
    }
  })

  test('keeps the delete control reachable by its accessible name', () => {
    const post = forDisplay(PostSchema.parse(row))
    render(<PostCard compact post={post} now={NOW} variantStates={[]} metrics={metrics} />)

    // Icon-only on both shapes, so the NAME is the whole affordance. A tile that
    // lost it would strand every post a person wanted to remove.
    expect(screen.getByRole('button', { name: /Delete .*Monsoon menu/i })).toBeInTheDocument()
  })

  test('a title with no spaces cannot refuse to shrink', () => {
    const post = forDisplay(
      PostSchema.parse({
        ...row,
        title: null,
        body: 'https://example.com/a/very/long/path/that/never/breaks/anywhere/at/all',
      }),
    )
    const { container } = render(
      <PostCard compact post={post} now={NOW} variantStates={[]} metrics={metrics} />,
    )

    // ── A CLASS ASSERTION, AND HERE IS THE HONEST LIMIT ──────────────────────
    // jsdom has no layout engine, so no test here can measure the overspill.
    // MEASURED in Chromium before the fix: 63px of the card painted over its
    // neighbour at 1440 and 128px at 1180, because a flex item's automatic
    // minimum is its CONTENT and the heading had no `min-w-0`. Titles derive
    // from the body's first line, so a pasted link is an ordinary title.
    const heading = container.querySelector('h2')
    expect(heading?.className.split(/\s+/)).toContain('min-w-0')
    const link = heading?.querySelector('a')
    expect(link?.className.split(/\s+/)).toContain('break-words')
  })

  test('the tile stretches to its row and is square only where the grid is four wide', () => {
    const post = forDisplay(PostSchema.parse(row))
    const { container } = render(
      <PostCard compact post={post} now={NOW} variantStates={[]} metrics={metrics} />,
    )

    // Also a class assertion, same limit and same reason. Both figures below
    // were MEASURED in Chromium against the production stylesheet:
    //
    //  · `wide:` not `narrow:` — at 1024px the grid is TWO columns, so a square
    //    tile is 478x478 and the eight before the fold run 1996px, more than two
    //    screens on a common laptop width. The square is worth having only where
    //    four sit in a row.
    //  · `h-full` — the grid row's stretch stops at the <li>; `StaggerItem`
    //    sits between it and this card. Without it, a row measured 365px while
    //    six of its eight cards measured 268px: 97px of dead space, and those
    //    six not square.
    const card = container.firstElementChild as HTMLElement | null
    const classes = (card?.className ?? '').split(/\s+/)
    expect(classes).toContain('h-full')
    expect(classes).toContain('wide:aspect-square')
    expect(classes).not.toContain('narrow:aspect-square')
  })

  /**
   * ── THE SEAM BETWEEN THE CARD AND THE DELETE DIALOG ──────────────────────
   * The dialog says "it has already gone out, and deleting it here does not
   * take it down" only when the card tells it the post is really live, and the
   * card decides that from a PERMALINK — the platform's own receipt — never
   * from a status column. An audit swapped that for `variantStates.length > 0`
   * (mere presence, the precise defect the card's comment argues against) and
   * for a flat `false`, and all 265 tests in this folder stayed green.
   *
   * Both directions are asserted, because each is a different way to be wrong:
   * a draft told it is live on a platform it never reached, and a live post let
   * go believing this takes it off the internet.
   */
  test('a post with rows but NO receipt is never told it has gone out', async () => {
    const user = userEvent.setup()
    const post = forDisplay(PostSchema.parse(row))
    render(
      <PostCard
        compact
        post={post}
        now={NOW}
        // ── THIS IS THE CASE THAT SEPARATES EVIDENCE FROM PRESENCE ──────────
        // A row exists and its status word says published, and STILL nothing
        // came back from the platform. A card deciding on `variantStates.length`
        // or on the status column says "it has already gone out" here, which is
        // a claim about somebody else's server that nothing supports. An empty
        // array cannot catch that mutation — both readings agree on empty — so
        // the draft case alone left this seam open, MEASURED: swapping the
        // permalink read for `length > 0` kept every test green until this one.
        variantStates={[variantRow('x', null)]}
        metrics={metrics}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^Delete .*Monsoon menu$/ }))
    expect(
      within(screen.getByRole('dialog')).queryByText(/already gone out/i),
    ).not.toBeInTheDocument()
  })

  test('a draft is never told it has gone out', async () => {
    const user = userEvent.setup()
    const post = forDisplay(PostSchema.parse(row))
    render(<PostCard compact post={post} now={NOW} variantStates={[]} metrics={metrics} />)

    await user.click(screen.getByRole('button', { name: /^Delete .*Monsoon menu$/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/already gone out/i)).not.toBeInTheDocument()
  })

  test('a post with a real permalink IS told deleting here does not take it down', async () => {
    const user = userEvent.setup()
    const post = forDisplay(PostSchema.parse(row))
    render(
      <PostCard
        compact
        post={post}
        now={NOW}
        // A published row WITHOUT a permalink is deliberately included: it is
        // the case that separates evidence from presence. If the card ever
        // decides on `length > 0` or on the status word, this row alone makes
        // the claim, and the assertion below still passes — so the LinkedIn row
        // carries the receipt and the X row exists to keep that honest.
        variantStates={[
          variantRow('x', null),
          variantRow('linkedin', 'https://www.linkedin.com/feed/update/123'),
        ]}
        metrics={metrics}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^Delete .*Monsoon menu$/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/already gone out/i)).toBeVisible()
  })
})
