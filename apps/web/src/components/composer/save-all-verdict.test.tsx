import { renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { toChannelSet, type Channel } from '@sahoda/shared'

import type { AutosaveApi } from '@/components/posts/use-autosave'
import type { VariantsApi } from '@/components/posts/use-variants'

import type { VariantFormatApi } from './use-variant-format'
import { useComposerActions } from './use-composer-actions'

vi.mock('@/app/actions/posts-schedule', () => ({
  schedulePost: vi.fn(async () => ({ ok: true, scheduledAt: null })),
  cancelSchedule: vi.fn(async () => ({ ok: true, scheduledAt: null })),
}))

/**
 * WHAT "SAVED" IS ALLOWED TO MEAN WHEN FOUR ROWS ARE BEING WRITTEN.
 *
 * ── THIS TEST EXISTS BECAUSE A MUTATION SURVIVED ─────────────────────────────
 * `saveAllAndWait` was written to AND the per-channel verdicts together, so one
 * refused version makes the whole answer false. Replacing that line with a bare
 * `await saveVersion(channel)` — discarding every channel's verdict — left the
 * entire suite GREEN. Nothing anywhere read the return value's correctness.
 *
 * That is not a cosmetic gap. Two things now depend on this boolean:
 *   · "Save as draft" prints "Saved as a draft" on true and a refusal on false;
 *   · "Send now" PUBLISHES on true. A save that reports success while a version
 *     never reached its row means the words on screen and the words on the
 *     platform are different words, which is the exact defect `flush` plus
 *     `saveVariantNow` were paired to prevent on the single-channel path.
 *
 * ── AND WHY IT DOES NOT STOP AT THE FIRST REFUSAL ────────────────────────────
 * The channels are separate rows. Abandoning three saves because the first was
 * refused loses work the writer can still see on screen, and tells them nothing
 * about the other three. Every channel is attempted; the VERDICT is what carries
 * the bad news.
 */

const CHANNELS = toChannelSet(['x', 'linkedin', 'instagram'])

interface Stubs {
  flushOk?: boolean
  /** Which channels `saveNow` refuses. */
  refuse?: readonly Channel[]
  dirty?: readonly Channel[]
}

function actions({ flushOk = true, refuse = [], dirty }: Stubs = {}) {
  const attempted: Channel[] = []
  const autosave = {
    flush: vi.fn(async () => flushOk),
    read: () => ({ scheduledAt: null }),
    update: vi.fn(),
  } as unknown as AutosaveApi
  const variants = {
    saveNow: vi.fn(async (channel: Channel) => {
      attempted.push(channel)
      return !refuse.includes(channel)
    }),
    dirtyChannels: () => [...(dirty ?? CHANNELS)],
  } as unknown as VariantsApi
  const formats = { reapply: vi.fn(async () => undefined) } as unknown as VariantFormatApi

  const { result } = renderHook(() =>
    useComposerActions(autosave, variants, formats, CHANNELS, { current: 'p1' }),
  )
  return { result, attempted, autosave }
}

describe('saveAllAndWait — the verdict two buttons act on', () => {
  test('every version landing is the only thing that makes it true', async () => {
    const { result } = actions()

    await expect(result.current.saveAllAndWait()).resolves.toBe(true)
  })

  test('ONE refused version makes the whole answer false', async () => {
    // THE MUTATION THAT SURVIVED. Reporting true here prints "Saved as a draft"
    // over a version that is still only on screen, and lets "Send now" publish
    // the words in the database instead of the words the writer is looking at.
    const { result } = actions({ refuse: ['linkedin'] })

    await expect(result.current.saveAllAndWait()).resolves.toBe(false)
  })

  test('a refusal in the MIDDLE still attempts every channel after it', async () => {
    // Separate rows. Giving up on Instagram because LinkedIn refused loses work
    // that was recoverable, and says nothing true about Instagram.
    const { result, attempted } = actions({ refuse: ['linkedin'] })

    await result.current.saveAllAndWait()

    expect(attempted).toEqual(['x', 'linkedin', 'instagram'])
  })

  test('a refusal on the LAST channel is not swallowed by the earlier successes', async () => {
    // The ordering trap in the other direction: `ok = saved && ok` and
    // `ok = ok && saved` differ once short-circuiting is involved, and a verdict
    // that only remembers the first channel is worse than no verdict.
    const { result } = actions({ refuse: ['instagram'] })

    await expect(result.current.saveAllAndWait()).resolves.toBe(false)
  })

  test('a failed POST save is false even when no version needed writing', async () => {
    // The post is written first and unconditionally. "Save as draft" on a post
    // whose only edit is its title has no dirty variants at all, and the flush
    // is the entire job.
    const { result, attempted } = actions({ flushOk: false, dirty: [] })

    await expect(result.current.saveAllAndWait()).resolves.toBe(false)
    expect(attempted).toEqual([])
  })

  test('a clean post with nothing dirty still writes the post itself', async () => {
    const { result, autosave } = actions({ dirty: [] })

    await expect(result.current.saveAllAndWait()).resolves.toBe(true)
    expect(autosave.flush).toHaveBeenCalled()
  })
})

describe('saveVersion — a double press is not a self-inflicted conflict', () => {
  /**
   * ── THE BUG THIS PINS ────────────────────────────────────────────────────────
   * `saveVersion` awaits the post flush before `saveNow` sets the variant's
   * `saving` flag, so the version card's Save button stays live through the whole
   * round trip. Two presses used to run two flushes and two `saveNow`s, both
   * compare-and-setting against the same held version — the second lost to a
   * conflict the writer inflicted on themselves. Remove the in-flight guard and
   * `attempted` becomes ['x', 'x'] and the flush count 2, and this fails.
   */
  test('two concurrent saves of one channel run a single write', async () => {
    const { result, attempted, autosave } = actions()

    const [a, b] = [result.current.saveVersion('x'), result.current.saveVersion('x')]
    const [ra, rb] = await Promise.all([a, b])

    expect(ra).toBe(true)
    expect(rb).toBe(true)
    expect(attempted).toEqual(['x']) // saveNow ran once, not twice
    expect(autosave.flush).toHaveBeenCalledTimes(1) // and the flush before it, once
  })

  test('once it settles, a fresh press writes again', async () => {
    // The guard is per-write, not a permanent latch: a real second save later
    // must still reach the row.
    const { result, attempted } = actions()

    await result.current.saveVersion('x')
    await result.current.saveVersion('x')

    expect(attempted).toEqual(['x', 'x'])
  })

  test('a save in flight for one channel does not block another', async () => {
    const { result, attempted } = actions()

    await Promise.all([result.current.saveVersion('x'), result.current.saveVersion('linkedin')])

    expect(attempted.sort()).toEqual(['linkedin', 'x'])
  })
})
