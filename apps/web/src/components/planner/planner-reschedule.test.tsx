import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { toChannelSet } from '@sahoda/shared'

vi.mock('@/app/actions/posts-schedule', () => ({
  schedulePost: vi.fn(async () => ({ ok: true, scheduledAt: null })),
  cancelSchedule: vi.fn(async () => ({ ok: true, scheduledAt: null })),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PlannerReschedule } from './planner-reschedule'

/**
 * THE ROW HAD NO TEST, AND THEN IT GREW A LAZY IMPORT.
 *
 * `ScheduleField` used to be a plain static import here. It now arrives through
 * `next/dynamic`, because shipping a month calendar and a half-hourly slot table
 * on every `/planner` visit pushed the route past its JavaScript budget: MEASURED
 * on Vercel at 835.8 KiB against 827.5 + 8 KiB of slack, which failed the deploy.
 * After the split the same route measures 823.6 KiB, 11.9 KiB inside the line.
 *
 * A lazy import is a NEW WAY TO FAIL. A wrong specifier, a missing named export
 * or a component that throws on mount all leave the row looking exactly like a
 * row that was never opened: a button, and nothing under it. Nothing on
 * `/planner` covered this control at all, in unit tests or in the Playwright
 * suite, so the failure would have reached the founder rather than the gate.
 *
 * These assert the ARRIVAL, not the import mechanism — the guarantee is that
 * opening the row produces a working picker, however it is loaded.
 */
const renderRow = (value: string | null = null) =>
  render(
    <PlannerReschedule
      postId="p1"
      zone="Asia/Kolkata"
      channels={toChannelSet(['linkedin'])}
      value={value}
      autoPublish
    />,
  )

/**
 * ── A SYNCHRONOUS ABSENCE PROVES NOTHING HERE ────────────────────────────────
 * The obvious closed-row test is `render, then querySelector, expect null`. It
 * passes whether the row is gated or not, because a `next/dynamic` child is
 * absent for a tick either way — MEASURED: mutating the gate to `{true ? …}`
 * left all four tests green.
 *
 * So the chunk is given time to land first, by opening a SECOND row and waiting
 * for its calendar. Both rows share one import promise, so once that one has
 * rendered its field the module is resolved and cached; a still-empty first row
 * is then empty because it is closed, not because it is slow.
 */
async function afterChunkArrives(): Promise<void> {
  const clock = render(
    <PlannerReschedule
      postId="clock"
      zone="Asia/Kolkata"
      channels={toChannelSet(['linkedin'])}
      value={null}
    />,
  )
  // Scoped to the clock's own container: `render` binds its queries to
  // document.body, so a bare getByRole would also match the row under test.
  fireEvent.click(within(clock.container).getByRole('button', { name: 'Schedule' }))
  await waitFor(() => {
    expect(clock.container.querySelector('[data-schedule-calendar]')).not.toBeNull()
  })
  clock.unmount()
}

describe('PlannerReschedule — the field behind the collapsed row', () => {
  test('renders no picker until the row is opened', async () => {
    const { container } = renderRow()

    await afterChunkArrives()

    expect(container.querySelector('[data-schedule-calendar]')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Schedule' }).length).toBeGreaterThan(0)
  })

  test('the picker ARRIVES after opening, which is what the lazy import risks', async () => {
    // The one that fails if the dynamic import is wrong. Everything else about
    // this component would keep passing: the button renders, the toggle flips,
    // the container appears. Only the field itself would be missing.
    const { container } = renderRow()

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))

    await waitFor(() => {
      expect(container.querySelector('[data-schedule-calendar]')).not.toBeNull()
    })
    expect(container.querySelector('[data-schedule-confirm]')).not.toBeNull()
  })

  test('a scheduled post opens on the committed panel, not the picker', async () => {
    // The other branch of the field, reached through the same import. A row that
    // already has a time should offer to change it rather than ask again.
    const { container } = renderRow(new Date(Date.now() + 86_400_000).toISOString())

    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }))

    await waitFor(() => {
      expect(container.querySelector('[data-schedule-committed]')).not.toBeNull()
    })
  })

  test('gives the month grid a container wide enough to hold seven columns', async () => {
    // w-64 is 256px. Seven day cells plus gaps inside that leaves each about
    // 30px, under the 44px touch floor the cells themselves ask for. The width
    // is the reason the calendar is usable here at all, so it is pinned.
    const { container } = renderRow()

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    await waitFor(() => {
      expect(container.querySelector('[data-schedule-calendar]')).not.toBeNull()
    })

    const panel = container.querySelector('[aria-busy]')
    expect(panel?.className).toContain('w-80')
    expect(panel?.className).not.toContain('w-64')
  })
})
