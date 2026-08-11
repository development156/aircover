import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { LivePhaseNote } from '@/components/posts/live/live-phase-note'
import { PublishStateProvider } from '@/components/posts/live/publish-state-provider'
import { WATCH_CAP_MS, type PublishSnapshot } from '@/lib/posts/live-state'

/**
 * The provider's TIMING, which the pure cadence tests cannot reach.
 *
 * `cadenceFor` is a table of inputs and answers and is tested as one. What it
 * cannot show is whether the effect around it ever asks the question again —
 * and that gap is where the interesting bug lived: the cadence correctly said
 * "do not poll" for a post scheduled ten minutes out, and the effect read that
 * as "do not look again", so the post published to a screen that never moved.
 */

const readPublishState = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/publish-state', () => ({ readPublishState }))

const POST_ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-08-11T12:00:00.000Z')

const snapshot = (over: Partial<PublishSnapshot['posts'][number]> = {}): PublishSnapshot => ({
  readAt: NOW.toISOString(),
  posts: [
    { postId: POST_ID, status: 'draft', scheduledAt: null, mode: null, variants: [], ...over },
  ],
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.setSystemTime(NOW)
  readPublishState.mockReset()
  readPublishState.mockResolvedValue(snapshot({ status: 'published' }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a post scheduled beyond the watch window', () => {
  test('is eventually polled, without being polled the whole time it waits', async () => {
    // Arrange — due in ten minutes. The watch window opens five minutes from now.
    render(
      <PublishStateProvider
        initial={snapshot({ status: 'scheduled', scheduledAt: '2026-08-11T12:10:00.000Z' })}
      >
        <span>list</span>
      </PublishStateProvider>,
    )

    // Assert (before) — nothing is fetched while the post is still far off. This
    // is the cost guarantee: an idle page costs what a static page costs.
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000)
    expect(readPublishState).not.toHaveBeenCalled()

    // Act — cross into the watch window, then let one watching interval elapse.
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

    // Assert (after) — THE REGRESSION TEST. Before the wake timer existed, the
    // effect armed nothing at mount and this stayed at zero forever.
    expect(readPublishState).toHaveBeenCalled()
  })
})

describe('a quiet page', () => {
  test('never polls at all when nothing is scheduled and nothing is in flight', async () => {
    render(
      <PublishStateProvider initial={snapshot({ status: 'draft' })}>
        <span>list</span>
      </PublishStateProvider>,
    )

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)

    expect(readPublishState).not.toHaveBeenCalled()
  })
})

describe('LivePhaseNote', () => {
  test('says nothing while the page is quiet', async () => {
    render(
      <PublishStateProvider initial={snapshot({ status: 'draft' })}>
        <LivePhaseNote />
      </PublishStateProvider>,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('says so once the watch has given up, rather than leaving a frozen chip', async () => {
    // A publish that never resolves. The watch stops at the cap by design — but
    // stopping silently would leave "Publishing" on screen with nothing behind
    // it, and a stale chip is indistinguishable from a current one.
    readPublishState.mockResolvedValue(snapshot({ status: 'publishing' }))

    render(
      <PublishStateProvider initial={snapshot({ status: 'publishing' })}>
        <LivePhaseNote />
      </PublishStateProvider>,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCH_CAP_MS + 10_000)
    })

    expect(screen.getByRole('status')).toHaveTextContent(/stopped watching for updates/i)
  })
})
