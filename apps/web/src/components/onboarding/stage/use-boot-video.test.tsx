import { act, cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const marked = vi.hoisted(() => ({ calls: 0 }))

vi.mock('@/app/actions/boot-video', () => ({
  markBootVideoSeen: () => {
    marked.calls += 1
    return Promise.resolve({ result: 'saved' as const })
  },
}))

import { useBootVideo, type BootEndReason } from './use-boot-video'

/**
 * THE FILM IS NEVER A GATE.
 *
 * The ruling has two halves that pull against each other: it plays, with sound,
 * and there is no way to skip it — AND nobody may ever be stuck on it. The
 * second half is four separate escapes, and a test that only proves the happy
 * path proves the easy half.
 *
 * Every one of these drives the REAL element events. jsdom does not decode
 * video, so `play()`, `currentTime` and `ended` are installed on the element
 * here — but the hook is given no seam of its own: it listens to `playing`,
 * `ended` and `error` exactly as it does in a browser, and reads `currentTime`
 * off the element exactly as it does in a browser.
 */

interface Harness {
  finishes: BootEndReason[]
  video: HTMLVideoElement
  start: () => void
  abort: () => void
  audio: () => string
}

let harness: Harness

/**
 * The controls live beside the element; the hook's ref holds the real one.
 *
 * The `mounted` flag exists so a test can make REACT unmount the video the way
 * the stage does when `step` stops being `result` — which is what nulls
 * `videoRef.current`. Removing the node by hand does not: React keeps the ref
 * pointing at a detached element, so the case would never be reproduced.
 */
function Rig({ onFinished }: { onFinished: (r: BootEndReason) => void }) {
  const boot = useBootVideo({ onFinished })
  const [mounted, setMounted] = useState(true)
  return (
    <div>
      <button type="button" data-testid="unmount" onClick={() => setMounted(false)} />
      {mounted ? (
        <video
          ref={boot.videoRef}
          data-testid="v"
          onPlaying={boot.onPlaying}
          onEnded={boot.onEnded}
          onError={boot.onError}
        />
      ) : null}
      <span data-testid="audio">{boot.audioPath}</span>
      <span data-testid="phase">{boot.phase}</span>
      <button type="button" data-testid="start" onClick={boot.start} />
      <button type="button" data-testid="abort" onClick={boot.abort} />
    </div>
  )
}

/** What `play()` does on this run. Replaced per test. */
let playImpl: () => Promise<void>

function mount(): Harness {
  const finishes: BootEndReason[] = []
  render(<Rig onFinished={(r) => finishes.push(r)} />)
  const video = document.querySelector('[data-testid="v"]') as HTMLVideoElement

  // jsdom's HTMLMediaElement throws "Not implemented" for play/pause and keeps
  // currentTime read-only. Installed per element so the hook talks to the same
  // shapes it does in a browser.
  Object.defineProperty(video, 'play', { writable: true, value: () => playImpl() })
  Object.defineProperty(video, 'pause', { writable: true, value: () => {} })
  let time = 0
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (v: number) => {
      time = v
    },
  })
  Object.defineProperty(video, 'ended', { configurable: true, writable: true, value: false })

  return {
    finishes,
    video,
    start: () => (document.querySelector('[data-testid="start"]') as HTMLButtonElement).click(),
    abort: () => (document.querySelector('[data-testid="abort"]') as HTMLButtonElement).click(),
    audio: () => document.querySelector('[data-testid="audio"]')!.textContent ?? '',
  }
}

const fire = (el: HTMLElement, type: string) =>
  act(() => {
    el.dispatchEvent(new Event(type))
  })

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

/** Let the `play()` promise's `.then` run without moving the clock. */
const settle = () => act(async () => {})

beforeEach(() => {
  vi.useFakeTimers()
  marked.calls = 0
  playImpl = () => Promise.resolve()
  harness = mount()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('the happy path', () => {
  test('plays to the end and finishes once', async () => {
    act(() => harness.start())
    await settle()

    fire(harness.video, 'playing')
    // Ten seconds of frames actually moving.
    for (let t = 1; t <= 10; t += 1) {
      harness.video.currentTime = t
      advance(1000)
    }
    fire(harness.video, 'ended')

    expect(harness.finishes).toEqual(['ended'])
  })

  test('the unmuted path is taken and the muted fallback is NOT entered', async () => {
    act(() => harness.start())
    await settle()

    expect(harness.audio()).toBe('unmuted')
    expect(harness.video.muted).toBe(false)
    expect(harness.video.volume).toBe(1)
  })

  test('sound is asked for again on a second run, never inherited from a refusal', async () => {
    // A first run that was refused leaves the element muted.
    playImpl = () => Promise.reject(new Error('NotAllowedError'))
    act(() => harness.start())
    await settle()
    expect(harness.video.muted).toBe(true)

    playImpl = () => Promise.resolve()
    act(() => harness.abort())
    act(() => harness.start())
    await settle()

    expect(harness.video.muted).toBe(false)
  })
})

describe('the audio policy', () => {
  test('a refused play() mutes and plays again rather than leaving a black screen', async () => {
    let attempts = 0
    playImpl = () => {
      attempts += 1
      return attempts === 1 ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve()
    }

    act(() => harness.start())
    await settle()

    expect(attempts).toBe(2)
    expect(harness.video.muted).toBe(true)
    expect(harness.audio()).toBe('muted-fallback')
    // Crucially: it is still going. A refusal is not an ending.
    expect(harness.finishes).toEqual([])
  })

  test('refused twice goes to the dashboard rather than sitting on nothing', async () => {
    playImpl = () => Promise.reject(new Error('NotAllowedError'))

    act(() => harness.start())
    await settle()
    await settle()

    expect(harness.finishes).toEqual(['blocked'])
  })
})

describe('watchdog 1 — it never starts', () => {
  test('no playing event within 2.5s of the click goes to the dashboard', async () => {
    playImpl = () => new Promise<void>(() => {})

    act(() => harness.start())
    advance(2499)
    expect(harness.finishes).toEqual([])

    advance(2)
    expect(harness.finishes).toEqual(['start-timeout'])
  })

  test('a start that DOES arrive disarms it', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')

    // Frames moving, well past the start deadline.
    for (let t = 1; t <= 6; t += 1) {
      harness.video.currentTime = t
      advance(1000)
    }

    expect(harness.finishes).toEqual([])
  })
})

describe('watchdog 2 — it starts and then dies', () => {
  /**
   * THE ONE A START-ONLY TIMER CANNOT SEE. `playing` fires at 100ms, the
   * connection gives out at two seconds, and a start deadline is satisfied
   * forever — leaving a person who has just signed up on a frozen frame with,
   * by design, no button to press.
   */
  test('currentTime frozen mid-playback for 2.5s goes to the dashboard', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')

    /**
     * The clock is measured from the POLL THAT OBSERVES the advance, not from
     * the moment `currentTime` moved — the watchdog only knows what it has
     * looked at. One poll (250ms) is allowed through so the observation is
     * recorded, and the stall is timed from there.
     */
    harness.video.currentTime = 1
    advance(250)

    // Frozen from here. The start deadline has long since been disarmed, so
    // nothing but this watchdog can end the run.
    advance(2250)
    expect(harness.finishes).toEqual([])

    advance(250)
    expect(harness.finishes).toEqual(['stalled'])
  })

  test('a slow but advancing film is never cut off', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')

    // Two seconds of wall clock per second of film — struggling, not stalled.
    for (let t = 1; t <= 10; t += 1) {
      advance(2000)
      harness.video.currentTime = t
    }

    expect(harness.finishes).toEqual([])
  })

  test('an ended film is not read as a stall', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')

    harness.video.currentTime = 10
    advance(500)
    Object.defineProperty(harness.video, 'ended', { configurable: true, value: true })
    // Time passes on the last frame; `ended` has not been dispatched yet.
    advance(5000)

    expect(harness.finishes).toEqual([])
  })
})

describe('watchdog 3 — the element gives up', () => {
  test('an error event goes to the dashboard immediately', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'error')

    expect(harness.finishes).toEqual(['error'])
  })

  test('a missing file — error before any playing — still lands', async () => {
    playImpl = () => new Promise<void>(() => {})
    act(() => harness.start())
    fire(harness.video, 'error')

    expect(harness.finishes).toEqual(['error'])
    // And the start deadline does not then fire a second time.
    advance(5000)
    expect(harness.finishes).toEqual(['error'])
  })
})

describe('finishing is idempotent', () => {
  /**
   * FOUR THINGS CAN END THIS AND THEY DO NOT TAKE TURNS.
   *
   * A film that reaches its last frame and then has its element torn down emits
   * `ended` AND `error`. Without the once-only guard both call `onFinished`, and
   * `onFinished` navigates — so the router is pushed twice, which in the App
   * Router leaves a history entry pointing back at an onboarding flow whose
   * state has already been cleared.
   */
  test('a second ending after the first navigates nobody twice', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')

    fire(harness.video, 'ended')
    fire(harness.video, 'error')
    advance(10_000)

    expect(harness.finishes).toEqual(['ended'])
  })

  test('an error and then an ended is still one navigation, and keeps the FIRST reason', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')

    fire(harness.video, 'error')
    fire(harness.video, 'ended')

    // The reason is reported, so it has to be the one that actually ended it.
    expect(harness.finishes).toEqual(['error'])
  })

  test('a stall and an ended racing in the same run navigate once', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')

    // Let the stall watchdog fire...
    advance(3000)
    // ...and then the film reports it finished anyway.
    fire(harness.video, 'ended')
    advance(10_000)

    expect(harness.finishes).toEqual(['stalled'])
  })

  test('the timers are stopped by the first ending, not left running', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')
    fire(harness.video, 'ended')

    // A stall watchdog left armed would fire here against a router that has
    // already moved.
    advance(60_000)

    expect(harness.finishes).toEqual(['ended'])
  })
})

describe('the flag is written when frames reach a screen', () => {
  test('marked on playing, not on the click', async () => {
    act(() => harness.start())
    await settle()
    expect(marked.calls).toBe(0)

    fire(harness.video, 'playing')
    expect(marked.calls).toBe(1)
  })

  /**
   * A film that never loaded was never shown. Marking it seen would mean the
   * customer whose connection dropped is never given it again.
   */
  test('NOT marked when it never starts', async () => {
    playImpl = () => new Promise<void>(() => {})
    act(() => harness.start())
    advance(3000)

    expect(harness.finishes).toEqual(['start-timeout'])
    expect(marked.calls).toBe(0)
  })

  test('NOT marked when the element errors', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'error')

    expect(marked.calls).toBe(0)
  })
})

describe('abort is not an ending', () => {
  /**
   * The save failed, so there is nowhere to go. The overlay has to come off so
   * the error can be read — and `onFinished` must NOT fire, or somebody lands on
   * a dashboard with their Brand Brain unsaved.
   */
  test('abort navigates nobody and stops the watchdogs', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')
    harness.video.currentTime = 1
    advance(500)

    act(() => harness.abort())
    advance(30_000)

    expect(harness.finishes).toEqual([])
    expect(document.querySelector('[data-testid="phase"]')!.textContent).toBe('idle')
  })
})

describe('the element vanishes mid-play', () => {
  /**
   * THE ONE FAILURE WITH NO WATCHDOG BEHIND IT, because every watchdog reads the
   * element that just went away.
   *
   * An unmounted `<video>` fires no `ended` and no `error`, and the start
   * deadline was disarmed by `playing`. Before this, the poll returned on a null
   * ref and spun forever: `onFinished` never ran, so the customer was left
   * wherever the unmount put them — with a saved Brand Brain and nothing to
   * press. Browser Back on the onboarding stage did exactly that.
   */
  test('is treated as an ending rather than spun on forever', async () => {
    act(() => harness.start())
    await settle()
    fire(harness.video, 'playing')
    harness.video.currentTime = 1
    advance(250)

    // The stage pops a history entry, the step changes, and REACT unmounts the
    // video — which is what nulls the ref the watchdog reads.
    act(() => {
      ;(document.querySelector('[data-testid="unmount"]') as HTMLButtonElement).click()
    })
    advance(1000)

    expect(harness.finishes).toEqual(['error'])
  })
})

describe('a file that died before the click', () => {
  /**
   * The element preloads from the result step, so a file that cannot be fetched
   * has usually already failed by the time Enter is pressed. Showing the overlay
   * and holding it for the full start deadline would be 2.5s of a brand-coloured
   * rectangle for somebody whose connection is already struggling.
   */
  test('is never shown, and lands on the dashboard at once', async () => {
    Object.defineProperty(harness.video, 'error', {
      configurable: true,
      value: { code: 4, message: 'MEDIA_ELEMENT_ERROR' },
    })

    act(() => harness.start())

    expect(harness.finishes).toEqual(['error'])
    // Never displayed: the phase went straight from idle to finished.
    expect(document.querySelector('[data-testid="phase"]')!.textContent).toBe('finished')
    // And no deadline was left armed to fire a second ending later.
    advance(30_000)
    expect(harness.finishes).toEqual(['error'])
  })

  test('a healthy element is NOT short-circuited by the same check', async () => {
    act(() => harness.start())
    await settle()

    expect(harness.finishes).toEqual([])
    expect(document.querySelector('[data-testid="phase"]')!.textContent).toBe('playing')
  })
})

describe('nothing to play', () => {
  test('start with no element mounted lands on the dashboard rather than hanging', async () => {
    const finishes: BootEndReason[] = []
    function NoVideo() {
      const boot = useBootVideo({ onFinished: (r) => finishes.push(r) })
      return <button type="button" data-testid="s2" onClick={boot.start} />
    }
    render(<NoVideo />)
    act(() => {
      ;(document.querySelector('[data-testid="s2"]') as HTMLButtonElement).click()
    })

    expect(finishes).toEqual(['error'])
  })
})
