import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { FinishPanel } from './finish-panel'

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
vi.mock('@/app/actions/posts-publish', () => ({ simulatePublish: vi.fn() }))

afterEach(cleanup)

/**
 * THE TWO ROUTES OUT OF A FINISHED POST.
 *
 * The panel used to stack the schedule picker, the dry run and the per-channel
 * publish rail one under another, always. It asks first now, and these are the
 * guards on that: what is offered, what is hidden, and the one case where the
 * question is already answered.
 */

const CHANNELS = ['x', 'linkedin'] as unknown as ChannelSet

function panel(overrides: Partial<Parameters<typeof FinishPanel>[0]> = {}) {
  return render(
    <FinishPanel
      postId="p1"
      channels={CHANNELS}
      scheduledAt={null}
      onScheduleChange={vi.fn()}
      scheduleError={null}
      autoPublish={false}
      statusRows={[]}
      flush={vi.fn(async () => true)}
      saveVariantNow={vi.fn(async (_channel: Channel) => true)}
      saveAllVersions={vi.fn(async () => true)}
      unsavedVersions={0}
      {...overrides}
    />,
  ).container
}

const scheduleControls = (root: HTMLElement) => root.querySelector('[data-guide="post-schedule"]')
const publishRail = (root: HTMLElement) => root.querySelector('[data-guide="post-publish-now"]')

/**
 * Both halves are fetched on demand, from chunks of their own, because the
 * composer route has 8 kB of build slack and they are behind a click. So every
 * case here awaits: a synchronous query would pass today and go red the moment
 * the split it exists to protect is real.
 */
function choose(name: 'Schedule it' | 'Post now') {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
}

const settled = async (root: HTMLElement, find: (r: HTMLElement) => Element | null) =>
  waitFor(() => expect(find(root)).toBeTruthy())

/**
 * A SECOND PANEL, OPENED, USED PURELY AS A CLOCK.
 *
 * An assertion that a half is ABSENT is worthless while its chunk is still in
 * flight — it would pass whether the half is gated behind a click or rendered
 * unconditionally. MEASURED: ungating both halves left the two at-rest cases
 * GREEN until this existed.
 *
 * Both panels share one import promise, so once the opened one has painted its
 * rail, a resting one has had exactly the same chance and either rendered its
 * own or has none to render. Calibrated by that mutation, which now turns the
 * at-rest cases red.
 */
async function afterChunksArrive() {
  const probe = render(
    <FinishPanel
      postId="p1"
      channels={CHANNELS}
      scheduledAt={null}
      onScheduleChange={vi.fn()}
      scheduleError={null}
      autoPublish={false}
      statusRows={[]}
      flush={vi.fn(async () => true)}
      saveVariantNow={vi.fn(async (_channel: Channel) => true)}
      saveAllVersions={vi.fn(async () => true)}
      unsavedVersions={0}
    />,
  ).container
  fireEvent.click(within(probe).getByRole('button', { name: /^Post now/ }))
  await settled(probe, publishRail)
}

describe('the panel asks before it offers', () => {
  test('opens with two choices and neither set of controls', async () => {
    const root = panel()

    expect(within(root).getByRole('button', { name: /^Schedule it/ })).toBeTruthy()
    expect(within(root).getByRole('button', { name: /^Post now/ })).toBeTruthy()

    await afterChunksArrive()

    // The point of the change. Every reader used to pay the full height of both
    // answers in order to give one.
    expect(scheduleControls(root)).toBeNull()
    expect(publishRail(root)).toBeNull()
  })

  test('and says plainly that choosing is not sending', () => {
    // A screen showing two large controls and nothing else has to answer "what
    // happens if I press one" before it is pressed.
    expect(screen.queryByText(/nothing goes out until you choose/i)).toBeNull()
    panel()
    expect(screen.getByText(/nothing goes out until you choose/i)).toBeTruthy()
  })
})

describe('choosing one opens that one and only that one', () => {
  test('Schedule it brings up the times, not the publish buttons', async () => {
    const root = panel()
    choose('Schedule it')
    await settled(root, scheduleControls)

    // The failure this catches is the old panel coming back by accident: a
    // writer here to pick Thursday must not be scrolling past live Publish
    // buttons to reach a date field.
    expect(publishRail(root)).toBeNull()
  })

  test('Post now brings up the publish buttons, not the times', async () => {
    const root = panel()
    choose('Post now')
    await settled(root, publishRail)

    expect(scheduleControls(root)).toBeNull()
  })

  test('the tiles report which one is chosen', () => {
    panel()
    const schedule = () => screen.getByRole('button', { name: /^Schedule it/ })
    const now = () => screen.getByRole('button', { name: /^Post now/ })

    expect(schedule().getAttribute('aria-pressed')).toBe('false')
    choose('Schedule it')
    expect(schedule().getAttribute('aria-pressed')).toBe('true')
    expect(now().getAttribute('aria-pressed')).toBe('false')

    choose('Post now')
    expect(schedule().getAttribute('aria-pressed')).toBe('false')
    expect(now().getAttribute('aria-pressed')).toBe('true')
  })
})

/**
 * A post with `scheduled_at` set IS scheduled — the chip that set it went
 * through `release_post_for_publish` at the moment it was pressed. Opening
 * closed would hide the only control that can move or clear that time, and the
 * reader would have no way to see a commitment their post is already under.
 */
describe('a post that is already scheduled', () => {
  test('opens on the schedule side without anyone clicking', async () => {
    const root = panel({ scheduledAt: '2026-09-01T09:00:00.000Z' })
    await settled(root, scheduleControls)

    expect(screen.getByRole('button', { name: /^Schedule it/ }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  test('and the writer can still switch to publishing now', async () => {
    const root = panel({ scheduledAt: '2026-09-01T09:00:00.000Z' })
    choose('Post now')
    await settled(root, publishRail)

    expect(scheduleControls(root)).toBeNull()
  })
})

describe('the calendar', () => {
  test('is a real link to the planner, and only beside the schedule', async () => {
    panel()
    expect(screen.queryByRole('link', { name: /calendar/i })).toBeNull()

    choose('Schedule it')

    const link = await screen.findByRole('link', { name: /calendar/i })
    // A LINK, not a button that pushes: `router.push` would not survive a reload,
    // would not appear in the page's link list, and could not be opened in a new
    // tab — which is exactly what somebody comparing two screens wants to do.
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/planner')
  })
})

describe('a post that does not exist yet', () => {
  test('says why the publish checks are absent rather than showing a dead button', async () => {
    const root = panel({ postId: null })
    choose('Post now')

    expect(await screen.findByText(/write a line first/i)).toBeTruthy()
    expect(publishRail(root)).toBeNull()
    // Not a disabled button. Nothing is broken and nothing is coming soon.
    expect(root.querySelectorAll('button[disabled]')).toHaveLength(0)
  })
})
