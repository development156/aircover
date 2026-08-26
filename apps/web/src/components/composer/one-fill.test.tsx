import { describe, expect, test, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
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
vi.mock('@/app/actions/posts-ai', () => ({ rewriteSelection: vi.fn(), generateVariants: vi.fn() }))
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
 * ONE SOLID BRAND FILL PER VIEW, ON THE SCREEN THAT BREAKS IT WORST.
 *
 * ── WHY THIS EXISTS WHEN A GUARD ALREADY DOES ────────────────────────────────
 * `e2e/page-dash-hierarchy.spec.ts` already asserts docs/37 §2.3 and §16 —
 * "exactly one solid-brand-fill element per view" — and it is a good guard. It
 * runs over exactly two routes: `for (const route of ['/home', '/analytics'])`
 * at `page-dash-hierarchy.spec.ts:195`.
 *
 * The composer is not one of them. It is the heaviest route in the product and
 * the one carrying the most controls, and it used to render **four** solid brand
 * fills at once: the orange "Adapt for N channels" button, and one full-width
 * orange "Publish to …" per connected channel from `publish-now.tsx`, where
 * `<Button>` takes the component's default variant, which is `primary`.
 *
 * A guard that never looks at a screen is not a weaker guard on that screen; it
 * is no guard at all. This one looks, and it looks without a browser: the fill
 * is a class, so it can be counted in jsdom and runs in the ordinary suite
 * rather than waiting on a Playwright leg this sandbox cannot execute.
 *
 * ── AND THIS IS THE CONVERSATION IT WAS WRITTEN TO FORCE ─────────────────────
 * The previous version of this file pinned FOUR and said: "Lower it and the test
 * goes red, and the person lowering it has to come here and say what they
 * changed." It went red. Here is what changed.
 *
 * `FinishPanel` now asks whether the post is being scheduled or published before
 * it offers either set of controls, so the per-channel publish rail is not on
 * the screen until a writer says that is what they came for. MEASURED with three
 * channels: **one** fill at rest, **four** with "Post now" open.
 *
 * ── SO THE VIOLATION IS DEFERRED, NOT FIXED, AND THIS SAYS BOTH ──────────────
 * Claiming §2.3 is satisfied would be the flattering read and it would be wrong.
 * The resting screen genuinely does obey the rule now — one element, the one
 * that does the thing this product exists to do. The opened state still breaks
 * it three times over, and that half is a real design decision nobody has taken:
 * the per-channel buttons are deliberate, because each channel publishes and
 * fails on its own, and collapsing them into one button would mean reporting one
 * verdict for four different outcomes.
 *
 * Both numbers are therefore pinned. Move either one and the test goes red, and
 * whoever moves it comes here and writes the next paragraph.
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

function composer() {
  return render(
    <Composer
      post={post}
      variants={[] as PostVariant[]}
      media={[]}
      templates={{ ok: true, templates: [] } as never}
    />,
  ).container
}

/**
 * Every ACTION painted in the solid brand fill.
 *
 * ── THE FIRST VERSION OF THIS COUNTED SEVEN, AND SEVEN WAS WRONG ─────────────
 * It matched every `bg-primary` element, which includes each channel's character
 * METER fill (`ui/progress.tsx`). A meter is a data mark, not a call to action:
 * §2.3 rations the primary ACTION — "exactly one element per screen may carry
 * the solid brand fill. Everything else is a secondary or a link" — and §9 gives
 * the same fill to the Certainty System's `.is-real` rung for an unrelated
 * reason. A count that lumps those together reports a number nobody can act on,
 * which is the failure this repository keeps paying for.
 *
 * So the filter is interactive elements only. That is the population the rule is
 * about, and it is why the number here is four rather than seven.
 */
function solidFills(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('button, a, [role="button"]')]
    .filter((el) => el.className.split(/\s+/).includes('bg-primary'))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40))
}

/**
 * Open the publish rail, which is what `FinishPanel` now gates it behind, and
 * WAIT for it: that half is fetched from a chunk of its own.
 */
async function openPublish(root: HTMLElement) {
  fireEvent.click(within(root).getByRole('button', { name: /^Post now/ }))
  await waitFor(() => expect(solidFills(root).length).toBeGreaterThan(1))
}

/**
 * A SECOND COMPOSER, OPENED, USED PURELY AS A CLOCK.
 *
 * `FinishPanel` loads both of its halves with `next/dynamic`, so a synchronous
 * count at mount reports one fill whether the publish rail is gated behind a
 * click or rendered unconditionally. The guard would then certify the rule as
 * kept on a screen that breaks it four times, which is the flattering answer and
 * the wrong one.
 *
 * Waiting a few ticks does not fix it — MEASURED: five macrotask ticks inside
 * `act` left the mutation GREEN, because the module import resolves later than
 * that. What IS deterministic is waiting on the same module: both composers
 * share one import promise, so once the opened one has painted its rail, an
 * ungated resting one has had exactly the same chance and has either rendered
 * its own or has none to render.
 *
 * CALIBRATED, not assumed: ungating the publish half turns the resting test red
 * with this in place. That mutation is the only reason to trust the number.
 */
async function afterChunksArrive(): Promise<void> {
  const probe = render(
    <Composer
      post={post}
      variants={[] as PostVariant[]}
      media={[]}
      templates={{ ok: true, templates: [] } as never}
    />,
  ).container
  await openPublish(probe)
}

describe('the composer against the one-fill rule', () => {
  test('obeys it at rest: ONE fill, and it is the one that does the work', async () => {
    const root = composer()
    await afterChunksArrive()
    const found = solidFills(root)

    expect(
      found,
      `docs/37 §2.3 allows ONE solid brand fill per view. Found ${found.length}:\n${found.join('\n')}`,
    ).toHaveLength(1)
    // Named, so a change that keeps the count by swapping WHICH element carries
    // the fill cannot pass. The one action this product exists to perform is the
    // one that gets the orange.
    expect(found[0]).toMatch(/^Adapt for/)
  })

  test('and breaks it three times over once the publish rail is opened', async () => {
    const root = composer()
    await openPublish(root)
    const found = solidFills(root)

    expect(found).toHaveLength(1 + CHANNELS.length)
    // WHICH fills, so a change that removes the Adapt button rather than the
    // rail cannot pass by keeping the total the same.
    expect(found.filter((t) => t.startsWith('Publish to'))).toHaveLength(CHANNELS.length)
  })

  test('the opened count follows the channel list, so it grows as a writer adds channels', async () => {
    // The rule is broken WORSE the more the screen is used, which is the part a
    // static count would hide.
    const one = render(
      <Composer
        post={{ ...post, channels: ['x'] } as unknown as Post}
        variants={[] as PostVariant[]}
        media={[]}
        templates={{ ok: true, templates: [] } as never}
      />,
    ).container
    await afterChunksArrive()
    expect(solidFills(one)).toHaveLength(1)
    await openPublish(one)
    expect(solidFills(one)).toHaveLength(2)
  })
})
