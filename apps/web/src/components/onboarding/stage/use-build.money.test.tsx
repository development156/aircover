import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useBuild } from './use-build'
import { DEFAULT_DATA, type OnboardingData } from './store'
import type { DoorOutcome } from './door-outcome'

/**
 * THE MONEY GUARD, ON THE SIDE OF THE SWAP THAT NOW RENDERS.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * QA #6 (2026-08-22) was "Resolve runs for seconds with zero pending state;
 * double-click ran it twice." It was fixed in `onboarding-flow.tsx`, and
 * `onboarding-stage.tsx` replaced that file as the mount point for /onboarding.
 * `onboarding-flow.tsx` is now unreachable — its own tests still pass, and they
 * prove nothing about the screen a customer meets. Nothing on this side of the
 * swap named the behaviour at all, so the merge would have restored the
 * double-charge with the entire gate green.
 *
 * ── WHY THE OLD TEST'S SHAPE WOULD NOT HAVE WORKED HERE, AND VICE VERSA ──────
 * The old flow dispatched through `useActionState`. React 19 QUEUES actions, so
 * a never-settling mock swallows the second dispatch even with no guard at all
 * — the old suite records that as a proven false green. `start` is a bare async
 * function with no queue in front of it, so two synchronous calls genuinely
 * both reach `resolveOnboarding`, and a never-settling mock is exactly right:
 * it holds the guard open across the second press, which is the whole question.
 *
 * PROVEN RED. With the `if (inFlight.current) return` removed, the first case
 * reports 2 calls, and with the ref replaced by the `busy` state it reports 2
 * as well — state does not commit between two calls in one tick, which is why
 * the guard is a ref and the render mirror is not the guard.
 */

const resolveOnboarding = vi.hoisted(() => vi.fn())
const saveBrandMemory = vi.hoisted(() => vi.fn())
const saveWorkspaceTheme = vi.hoisted(() => vi.fn())

vi.mock('@/app/actions/onboarding-resolve', () => ({ resolveOnboarding }))
vi.mock('@/app/actions/brand-resolve', () => ({ saveBrandMemory }))
vi.mock('@/app/actions/theme', () => ({ saveWorkspaceTheme }))

/** No site given, so `settleDoor` returns without waiting on anything. */
const DOOR: DoorOutcome = { kind: 'none' }

function data(): OnboardingData {
  return { ...DEFAULT_DATA, name: 'Chai & Chapters' }
}

function build() {
  return renderHook(() =>
    useBuild({
      data: data(),
      door: DOOR,
      workspaceName: 'Chai & Chapters',
      reduced: true,
      orb: { current: null },
      onBuilt: () => {},
      onDoorSettled: () => {},
    }),
  )
}

beforeEach(() => {
  resolveOnboarding.mockReset()
  saveBrandMemory.mockReset()
  saveWorkspaceTheme.mockReset()
})

describe('one press, one charge', () => {
  test('two starts in the same tick reach the resolve ONCE', async () => {
    // Never settles. Two dispatches are two charges only if the second gets
    // past the guard, and it can only get past it while the first is in flight.
    resolveOnboarding.mockReturnValue(new Promise(() => {}))
    const { result } = build()

    await act(async () => {
      void result.current.start()
      void result.current.start()
    })

    // THE MONEY. A second call here is a second `brand_research` request. The
    // ledger key is bound to the brain version, so it would not be a second
    // 50-credit DEBIT, but two overlapping holds on one key race and both run a
    // real model call. The double REQUEST is what this stops.
    expect(resolveOnboarding).toHaveBeenCalledTimes(1)
  })

  test('the SKIP button cannot slip past the button that is disabled', async () => {
    // `#next` and `#skip` are two different controls calling the same paid
    // function, so a per-button `disabled` would leave the other one open.
    // One shared ref is what makes the cross-button case impossible.
    resolveOnboarding.mockReturnValue(new Promise(() => {}))
    const { result } = build()

    await act(async () => {
      const { start } = result.current
      void start() // #next
      void start() // #skip, same tick
      void start() // Enter, same tick
    })

    expect(resolveOnboarding).toHaveBeenCalledTimes(1)
  })

  test('DISMISS does not release the guard while the resolve is still running', async () => {
    // `dismiss` is the overlay's Back. It sets `processing` false — the screen
    // goes away — but the resolve it started is still in flight and will still
    // charge. Releasing the guard here reopens the double-charge through a
    // control that does not look like a resolve button at all.
    //
    // This case was written because it SURVIVED the first mutation run: with
    // `inFlight.current = false` added to `dismiss`, all five other assertions
    // stayed green. A guard is only as good as the ways it has been broken.
    resolveOnboarding.mockReturnValue(new Promise(() => {}))
    const { result } = build()

    await act(async () => {
      void result.current.start()
    })
    act(() => result.current.dismiss())
    await act(async () => {
      void result.current.start()
    })

    expect(resolveOnboarding).toHaveBeenCalledTimes(1)
  })

  test('a settled FAILURE releases the guard, so Retry works', async () => {
    // The failure arms deliberately leave `processing` true so the overlay can
    // offer Retry. If the guard were released on `processing` — or not at all —
    // that Retry would be dead and the customer would be stuck on a screen
    // whose only control does nothing.
    resolveOnboarding.mockResolvedValue({ ok: false, kind: 'error', message: 'no' })
    const { result } = build()

    await act(async () => {
      await result.current.start()
    })
    expect(result.current.failure?.message).toBe('no')

    await act(async () => {
      await result.current.start()
    })
    expect(resolveOnboarding).toHaveBeenCalledTimes(2)
  })

  test('a daily-limit refusal is NOT retryable, because its own sentence says tomorrow', async () => {
    // MEASURED 2026-09-05 (docs/51 Q-02): "Sahoda has built a free Brand Brain
    // for this workspace 3 times today… Try again tomorrow." rendered beside a
    // "Try again" button. A remedy that cannot work is the product's own rule 2.
    resolveOnboarding.mockResolvedValue({
      ok: false,
      kind: 'limit',
      message: 'Try again tomorrow.',
    })
    const { result } = build()

    await act(async () => {
      await result.current.start()
    })
    expect(result.current.failure?.message).toBe('Try again tomorrow.')
    expect(result.current.failure?.retryable).toBe(false)
    // And it says which kind it is, so the footer can stop promising "free".
    expect(result.current.failure?.kind).toBe('limit')
  })

  test('a THROWN resolve releases the guard rather than latching it dead', async () => {
    // A rejection is the arm a guard placed anywhere but a `finally` misses.
    // It would leave `inFlight` true forever and every later press would be
    // silently swallowed, which looks exactly like a button that is broken.
    resolveOnboarding.mockRejectedValueOnce(new Error('network'))
    const { result } = build()

    await act(async () => {
      await result.current.start().catch(() => {})
    })

    resolveOnboarding.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      void result.current.start()
    })
    expect(resolveOnboarding).toHaveBeenCalledTimes(2)
  })

  test('a THROWN save releases the save guard rather than latching the screen', async () => {
    /*
     * The arm a never-settling mock cannot reach, and the one that matters most:
     * a rejection used to leave `saveInFlight` true and `saving` true forever.
     * ResultStep reads `saving`, so both of its buttons would sit in a saving
     * state showing no error while the ref swallowed every retry — a resolved
     * brain, permanently unreachable, on a screen that looks like it is working.
     */
    resolveOnboarding.mockResolvedValue({ ok: true, kind: 'free', brain: { fields: {} } })
    saveBrandMemory.mockRejectedValueOnce(new Error('connection lost'))
    const { result } = build()

    await act(async () => {
      await result.current.start()
    })
    await act(async () => {
      await result.current.finish(() => {}).catch(() => {})
    })
    // The screen is not stuck saying it is saving.
    expect(result.current.saving).toBe(false)

    // And a retry actually reaches the action.
    saveBrandMemory.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      void result.current.finish(() => {})
    })
    expect(saveBrandMemory).toHaveBeenCalledTimes(2)
  })

  test('two finishes in the same tick save the brain ONCE', async () => {
    // Not a charge — `saveBrandMemory` never calls the mesh — but two presses
    // write two `brand_memory` versions and save the theme twice.
    resolveOnboarding.mockResolvedValue({ ok: true, kind: 'free', brain: { fields: {} } })
    saveBrandMemory.mockReturnValue(new Promise(() => {}))
    const { result } = build()

    await act(async () => {
      await result.current.start()
    })

    await act(async () => {
      void result.current.finish(() => {})
      void result.current.finish(() => {})
    })

    expect(saveBrandMemory).toHaveBeenCalledTimes(1)
  })
})
