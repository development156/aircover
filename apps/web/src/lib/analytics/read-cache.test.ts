import { describe, it, expect, beforeEach } from 'vitest'

import {
  LIVE_READ_CONCURRENCY,
  LIVE_READ_TTL_MS,
  mapBounded,
  memoLiveRead,
  resetLiveReadCache,
} from '@/lib/analytics/read-cache'

/**
 * The plumbing under every live Zernio read, tested with a fake clock and hand-
 * resolved promises so nothing here waits on real time.
 *
 * What is pinned: the pool never has more than its cap in flight and never
 * leaves a slot idle while work remains; the memo answers a second call within
 * the TTL without calling at all, asks again once the TTL has passed, keeps keys
 * apart, shares an in-flight read, and never remembers a failure.
 */

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

/** A promise the test resolves by hand, so in-flight counts can be observed. */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise<void>((res) => setTimeout(res, 0))

beforeEach(() => resetLiveReadCache())

describe('mapBounded keeps at most the cap in flight', () => {
  it('never exceeds the cap, and refills a slot the moment one finishes', async () => {
    const pending: Deferred<number>[] = []
    let inFlight = 0
    let peak = 0

    const run = mapBounded([1, 2, 3, 4, 5, 6, 7], 3, (n) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      const d = deferred<number>()
      pending.push(d)
      return d.promise.then((v) => {
        inFlight -= 1
        return v * n
      })
    })

    await tick()
    expect(pending).toHaveLength(3)
    expect(peak).toBe(3)

    // Finish ONE. Batching would wait for all three; a pool starts the fourth now.
    pending[1]!.resolve(10)
    await tick()
    expect(pending).toHaveLength(4)
    expect(peak).toBe(3)

    // Drain: resolve whatever is in flight, let the pool refill, repeat.
    let resolved = 0
    pending[0]!.resolve(1)
    pending[2]!.resolve(1)
    pending[3]!.resolve(1)
    resolved = 4
    while (resolved < 7) {
      await tick()
      while (resolved < pending.length) {
        pending[resolved]!.resolve(1)
        resolved += 1
      }
    }
    const out = await run
    expect(out).toEqual([1, 20, 3, 4, 5, 6, 7])
    expect(peak).toBe(3)
  })

  it('preserves input order in the output whatever order the work finishes in', async () => {
    const out = await mapBounded(
      [30, 10, 20],
      2,
      (ms) => new Promise<number>((res) => setTimeout(() => res(ms), ms / 10)),
    )
    expect(out).toEqual([30, 10, 20])
  })

  it('handles an empty list and a cap larger than the list', async () => {
    expect(await mapBounded([], 4, async (n: number) => n)).toEqual([])
    expect(await mapBounded([1, 2], 10, async (n) => n + 1)).toEqual([2, 3])
  })

  it('refuses a cap that would run nothing', async () => {
    await expect(mapBounded([1], 0, async (n) => n)).rejects.toThrow(RangeError)
  })

  it('has a cap that stays under a 60-a-minute budget', () => {
    expect(LIVE_READ_CONCURRENCY).toBeGreaterThanOrEqual(1)
    expect(LIVE_READ_CONCURRENCY).toBeLessThanOrEqual(8)
  })
})

describe('memoLiveRead answers from memory inside the TTL', () => {
  const T0 = Date.parse('2026-09-03T10:00:00.000Z')

  it('calls once for two reads of one key inside the TTL, and stamps when it asked', async () => {
    let calls = 0
    const read = async () => {
      calls += 1
      return { n: calls }
    }

    const first = await memoLiveRead('k', read, T0)
    const second = await memoLiveRead('k', read, T0 + LIVE_READ_TTL_MS - 1)

    expect(calls).toBe(1)
    expect(second.value).toEqual({ n: 1 })
    // The time carried is when the platform was ASKED, not when the memo answered.
    expect(first.readAt).toBe('2026-09-03T10:00:00.000Z')
    expect(second.readAt).toBe('2026-09-03T10:00:00.000Z')
  })

  it('asks again once the TTL has passed', async () => {
    let calls = 0
    const read = async () => ++calls

    await memoLiveRead('k', read, T0)
    const later = await memoLiveRead('k', read, T0 + LIVE_READ_TTL_MS)

    expect(calls).toBe(2)
    expect(later.value).toBe(2)
    expect(later.readAt).toBe(new Date(T0 + LIVE_READ_TTL_MS).toISOString())
  })

  it('keeps different keys apart', async () => {
    let calls = 0
    const read = async () => ++calls
    await memoLiveRead('a', read, T0)
    await memoLiveRead('b', read, T0)
    expect(calls).toBe(2)
  })

  it('shares one in-flight read between callers that arrive together', async () => {
    const d = deferred<string>()
    let calls = 0
    const read = () => {
      calls += 1
      return d.promise
    }

    const one = memoLiveRead('k', read, T0)
    const two = memoLiveRead('k', read, T0 + 5)
    d.resolve('answer')

    expect((await one).value).toBe('answer')
    expect((await two).value).toBe('answer')
    expect(calls).toBe(1)
  })

  it('never remembers a failure: the next call asks again', async () => {
    let calls = 0
    const failing = async () => {
      calls += 1
      throw new Error('502')
    }
    await expect(memoLiveRead('k', failing, T0)).rejects.toThrow('502')

    const ok = async () => {
      calls += 1
      return 'recovered'
    }
    const next = await memoLiveRead('k', ok, T0 + 1)
    expect(calls).toBe(2)
    expect(next.value).toBe('recovered')
  })

  it('treats a synchronous throw inside the read as a failed call', async () => {
    const throws = () => {
      throw new Error('sync')
    }
    await expect(memoLiveRead('k', throws as () => Promise<never>, T0)).rejects.toThrow('sync')
    let calls = 0
    await memoLiveRead(
      'k',
      async () => {
        calls += 1
        return 1
      },
      T0,
    )
    expect(calls).toBe(1)
  })

  it('forgets everything on reset', async () => {
    let calls = 0
    const read = async () => ++calls
    await memoLiveRead('k', read, T0)
    resetLiveReadCache()
    await memoLiveRead('k', read, T0)
    expect(calls).toBe(2)
  })
})
