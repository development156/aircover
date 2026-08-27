import { describe, expect, test, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Post, PostVariant } from '@sahoda/shared'

import { Composer } from './composer'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/posts/p1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/posts-ai', () => ({
  rewriteSelection: vi.fn(),
  generateVariants: vi.fn(),
  rewriteCaption: vi.fn(),
}))
vi.mock('@/app/actions/posts', () => ({
  createPost: vi.fn(),
  savePost: vi.fn(),
  saveVariant: vi.fn(),
  setVariantFormat: vi.fn(),
}))
vi.mock('@/app/actions/posts-schedule', () => ({ schedulePost: vi.fn(), cancelSchedule: vi.fn() }))
vi.mock('@/app/actions/posts-publish', () => ({ simulatePublish: vi.fn() }))
vi.mock('@/app/actions/templates', () => ({ saveTemplate: vi.fn(), deleteTemplate: vi.fn() }))

afterEach(cleanup)

/**
 * THE BRAND FILL, AND THE RULE IT NOW FOLLOWS.
 *
 * ── WHAT THIS FILE USED TO SAY, AND WHY IT DOES NOT ANY MORE ─────────────────
 * It asserted docs/37 §2.3 — "exactly one solid-brand-fill element per view" —
 * and it pinned the composer's violation at four so nobody could move the number
 * by accident. It did its job twice: it went red when the Send-it split dropped
 * the resting count to one, and it went red again here.
 *
 * The founder has now ruled, and the ruling is recorded in `REQUESTS.md` §31:
 *
 *   "make clickable buttons like send and schedule orange with black text or
 *    more like save cancel things like that should be highlighted"
 *
 * §2.3's one-per-view budget does not survive that, and pretending otherwise by
 * leaving a red test in the tree would be worse than saying so. What replaces it
 * is a rule with the same property — countable, and violated by accident rather
 * than on purpose:
 *
 *   EVERY BUTTON THAT COMMITS CARRIES THE FILL. NOTHING ELSE DOES.
 *
 * Committing means it writes to the row or sends to a platform: Save, Save all
 * versions, Adapt (which spends credits and writes variants), Confirm schedule,
 * Confirm and send. A button that OPENS something, CANCELS something, or offers
 * one of several equivalent choices does not, because a screen where everything
 * is loud tells the reader nothing about which thing is the point.
 *
 * `text-primary-foreground` is ink, not white — `button.tsx` measures the pair
 * at 7.15:1 — so "orange with black text" is what the primary variant already
 * was. No new colour pair was invented for this.
 */

const CHANNELS = ['x', 'linkedin', 'instagram'] as const

const post = {
  id: 'p1',
  workspace_id: 'w1',
  title: 'Diwali offer',
  body: 'Fresh bread every morning at the Koregaon Park shop.',
  channels: CHANNELS,
  status: 'draft',
  scheduled_at: null,
  origin: 'manual',
  created_at: '',
  updated_at: '',
} as unknown as Post

function composer(channels: readonly string[] = CHANNELS) {
  return render(
    <Composer
      post={{ ...post, channels } as unknown as Post}
      variants={[] as PostVariant[]}
      media={[]}
      templates={{ ok: true, templates: [] } as never}
    />,
  ).container
}

/**
 * Every ACTION painted in the solid brand fill.
 *
 * Interactive elements only. An earlier version of this counted seven by
 * matching every `bg-primary` element, which swept in each channel's character
 * METER fill from `ui/progress.tsx`. A meter is a data mark, not a call to
 * action, and a count that lumps those together reports a number nobody can act
 * on.
 */
function solidFills(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('button, a, [role="button"]')]
    .filter((el) => el.className.split(/\s+/).includes('bg-primary'))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 44))
}

/**
 * A SECOND, OPENED COMPOSER USED PURELY AS A CLOCK.
 *
 * `FinishPanel` loads both of its halves with `next/dynamic`, so a synchronous
 * count at mount cannot tell a gated half from an ungated one. Both instances
 * share one import promise, so once the opened one has painted its rail, a
 * resting one has had exactly the same chance.
 *
 * CALIBRATED, not assumed: ungating the publish half turns the resting test red
 * with this in place and left it GREEN without it. Five macrotask ticks inside
 * `act` were not enough — the module resolves later than that.
 */
async function afterChunksArrive(): Promise<void> {
  const probe = composer()
  fireEvent.click(within(probe).getByRole('button', { name: /^Post now/ }))
  await waitFor(() => expect(probe.querySelector('[data-guide="post-publish-now"]')).toBeTruthy())
}

describe('the brand fill marks what commits, and only that', () => {
  /**
   * "Save all versions" WAS the fifth entry here and it is deliberately gone.
   *
   * The sticky bar no longer carries a save button: both endings moved into
   * `SendControls`, under the dry run, and that half is behind the "Post now"
   * tile so it is not on screen at rest. The list is still asserted EXACTLY
   * rather than loosened to a count — the whole value of this guard is that a
   * new fill has to be argued for, and `toHaveLength(4)` would let any fourth
   * one through as long as one left.
   */
  test('at rest it is Adapt and one Save per channel, and nothing else', async () => {
    const root = composer()
    await afterChunksArrive()
    const found = solidFills(root)

    expect(found, `Found ${found.length} brand fills:\n${found.join('\n')}`).toEqual([
      'Adapt for 3 channels · 3 credits',
      'Save',
      'Save',
      'Save',
    ])
  })

  test('the Save count follows the channel list, one per card', async () => {
    const one = composer(['x'])
    await afterChunksArrive()

    expect(solidFills(one).filter((label) => label === 'Save')).toHaveLength(1)
  })

  /**
   * THE HALF THAT KEEPS THE RULE MEANINGFUL.
   *
   * "Everything that commits is orange" is only useful alongside "and nothing
   * else is". These four are the controls most likely to be promoted by someone
   * who reads the ruling as "make the important buttons orange" — they are
   * prominent, and none of them writes anything.
   */
  test('nothing that merely opens, chooses or cancels carries it', async () => {
    const root = composer()
    await afterChunksArrive()
    const found = solidFills(root)

    for (const label of ['Schedule it', 'Post now', 'Emoji', 'Polish']) {
      expect(
        found.some((fill) => fill.startsWith(label)),
        `${label} opens or chooses; it must not wear the committing fill`,
      ).toBe(false)
    }
  })

  test('and Undo, Redo and Clear never do, on any channel', async () => {
    const root = composer()
    await afterChunksArrive()
    const found = solidFills(root)

    for (const label of ['Undo', 'Redo', 'Clear']) {
      expect(
        found.some((fill) => fill.startsWith(label)),
        label,
      ).toBe(false)
    }
  })
})

describe('the committing buttons inside the Send it panel', () => {
  test('Confirm schedule is the schedule side one fill', async () => {
    const root = composer()
    fireEvent.click(screen.getByRole('button', { name: /^Schedule it/ }))
    const confirm = await screen.findByRole('button', { name: /Confirm schedule/ })

    expect(confirm.className.split(/\s+/)).toContain('bg-primary')
    // And "Save as draft" beside it does NOT: it is the way out, not the act.
    const draft = within(root).getByRole('button', { name: /Save as draft/ })
    expect(draft.className.split(/\s+/)).not.toContain('bg-primary')
  })
})
