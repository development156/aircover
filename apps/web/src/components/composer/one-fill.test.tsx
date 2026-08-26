import { describe, expect, test, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
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
 * the one carrying the most controls, and MEASURED in Chromium with three
 * channels selected it renders **four** solid brand fills at once: the orange
 * "Adapt for 3 channels" button, and one full-width orange "Publish to …" per
 * connected channel from `publish-now.tsx:211`, where `<Button>` takes the
 * component's default variant, which is `primary`.
 *
 * A guard that never looks at a screen is not a weaker guard on that screen; it
 * is no guard at all. This one looks, and it looks without a browser: the fill
 * is a class, so it can be counted in jsdom and runs in the ordinary suite
 * rather than waiting on a Playwright leg this sandbox cannot execute.
 *
 * ── IT ASSERTS THE COUNT IT FINDS, ON PURPOSE ────────────────────────────────
 * The count is FOUR today and this test says so rather than demanding one. A
 * test that failed immediately would be deleted by the next person who needed a
 * green suite, and the fix is a real design decision — three per-channel Publish
 * buttons are deliberate, because each channel publishes and fails on its own.
 *
 * So this pins the number and forces the conversation. Raise it and the test
 * goes red. Lower it and the test goes red, and the person lowering it has to
 * come here and say what they changed. Either way nobody moves it by accident.
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

describe('the composer against the one-fill rule', () => {
  test('renders FOUR solid brand fills, which is three more than docs/37 allows', () => {
    const found = solidFills(composer())

    expect(
      found.length,
      `docs/37 §2.3 allows ONE solid brand fill per view. Found ${found.length}:\n${found.join('\n')}`,
    ).toBe(4)
  })

  test('and three of them are the per-channel Publish buttons, one per channel', () => {
    // Named so the next reader knows WHICH fills, and so a change that removes
    // the Adapt button rather than the Publish rail cannot pass by keeping the
    // total the same.
    const publish = solidFills(composer()).filter((t) => t.startsWith('Publish to'))
    expect(publish).toHaveLength(CHANNELS.length)
  })

  test('the count follows the channel list, so it grows as a writer adds channels', () => {
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
    expect(solidFills(one).length).toBe(2)
  })
})
