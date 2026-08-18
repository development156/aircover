import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { toChannelSet } from '@sahoda/shared'

/**
 * WHAT A BACK PRESS COSTS THE PERSON WRITING.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * `onBlur` was the create flow's ONLY save. MEASURED in a browser: 100
 * characters typed into the Instagram body, browser Back, then Forward — 65 came
 * back. The 35 typed since the last blur were gone, and gone permanently,
 * because Forward re-reads the row. On a phone that Back is the swipe gesture,
 * which is how people leave a screen.
 *
 * The page's own comment claimed the flow was "backed by a real row" so a reload
 * could not discard what was written. That was only ever true of text the writer
 * had blurred out of.
 *
 * ── WHY BOTH TRIGGERS ARE ASSERTED ───────────────────────────────────────────
 * The debounce alone still loses everything typed in the last two seconds, which
 * is exactly when someone reaches for Back. The unmount flush alone writes only
 * on the way out, so a crash or a killed tab keeps nothing. Neither is the fix;
 * the pair is.
 *
 * `pagehide` is NOT the answer and is not tested for: a client-routed Back fires
 * no unload event at all, which is why this had to hang off React's own teardown.
 */

const state = vi.hoisted(() => ({
  saved: [] as Array<{ postId: string; channel: string; body: string }>,
  step: 'content',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ step: state.step, post: 'post_1' }),
}))

vi.mock('@/app/actions/posts', () => ({
  createPost: vi.fn(),
  savePost: vi.fn(async () => ({ ok: true })),
  saveVariant: vi.fn(async (postId: string, channel: string, body: string) => {
    state.saved.push({ postId, channel, body })
    return { ok: true }
  }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { CreateFlow } from './create-flow'

function renderFlow() {
  return render(
    <CreateFlow
      connected={['instagram']}
      postId="post_1"
      initialChannels={['instagram']}
      initialBodies={{}}
      initialScheduledAt={null}
      media={[]}
      previews={[]}
      postChannels={toChannelSet(['instagram'])}
    />,
  )
}

beforeEach(() => {
  state.saved = []
  state.step = 'content'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the create flow keeps what was typed', () => {
  test('writes the body after a pause, without waiting for a blur', async () => {
    vi.useFakeTimers()
    renderFlow()

    // `fireEvent`, not `userEvent`: userEvent drives its own timers and
    // deadlocks against vi's fake ones. One change event is the same input the
    // debounce sees on the last keystroke, which is what is under test.
    fireEvent.change(screen.getByRole('textbox', { name: /instagram copy/i }), {
      target: { value: 'Sourdough at seven' },
    })
    // Nothing yet — a write per keystroke is what the blur-only design avoided,
    // and that trade is kept.
    expect(state.saved).toEqual([])

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(state.saved.at(-1)).toEqual({
      postId: 'post_1',
      channel: 'instagram',
      body: 'Sourdough at seven',
    })
  })

  test('writes what is pending when the flow goes away — which is what Back does', async () => {
    const user = userEvent.setup()
    const { unmount } = renderFlow()

    await user.type(screen.getByRole('textbox', { name: /instagram copy/i }), 'Never blurred')
    expect(state.saved).toEqual([])

    // A client-routed Back tears this component down and fires no unload event.
    unmount()

    expect(state.saved.at(-1)).toMatchObject({ channel: 'instagram', body: 'Never blurred' })
  })

  test('a blur still writes immediately, and only once', async () => {
    const user = userEvent.setup()
    renderFlow()

    const box = screen.getByRole('textbox', { name: /instagram copy/i })
    await user.type(box, 'Blurred out')
    await user.tab()

    expect(state.saved).toHaveLength(1)
    expect(state.saved[0]).toMatchObject({ body: 'Blurred out' })
  })
})
