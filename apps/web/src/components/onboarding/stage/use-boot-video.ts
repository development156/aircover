'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { markBootVideoSeen } from '@/app/actions/boot-video'

/**
 * THE BOOT ANIMATION'S STATE MACHINE.
 *
 * Ten seconds of brand film between the last onboarding step and the dashboard,
 * with sound, with no way to skip it — and with three separate ways to abandon
 * it that are NOT skip controls. The difference matters and is the whole design:
 * nobody may choose to leave, and nobody may be trapped.
 *
 * ── THE AUDIO IS THE REASON `start()` IS SHAPED LIKE THIS ────────────────────
 * Browsers permit sound when playback begins inside a user gesture. The last
 * onboarding step ends with a real button press, so the permission is available
 * — but only if `play()` is reached from that click's own call stack. An
 * `await` first, or a `useEffect` that runs on the next render, both spend it.
 *
 * So `start()` is SYNCHRONOUS and calls `play()` on the element before it
 * touches React state. The element is already in the document (mounted, hidden,
 * `preload="auto"`) because a `<video>` created in the same tick as the click has
 * no data to play. Everything else — the overlay, the save, the prefetch — runs
 * after, and none of it can spend the gesture.
 *
 * `play()` returns a promise, and a REJECTION is the browser saying no to sound
 * rather than no to video. The retry mutes and plays again. Which of the two
 * happened is recorded in `audioPath`, because "it played" and "it played
 * silently" are different outcomes and only one of them is what was asked for.
 *
 * ── THREE WATCHDOGS, NOT ONE ─────────────────────────────────────────────────
 * A single "did it start" timer is the obvious version and it is not enough. A
 * film that emits `playing` at 100ms and then stalls on a bad connection at two
 * seconds satisfies a start deadline forever, and leaves a person who has just
 * signed up staring at a frozen frame with — by design — no button to press.
 *
 *   1. START     no `playing` within 2.5s of the click. Covers a missing file, a
 *                404, a codec the browser will not open, a first byte that never
 *                arrives.
 *   2. PROGRESS  `currentTime` has not advanced for 2.5s while not ended. Covers
 *                everything that dies AFTER it starts, which the first cannot
 *                see.
 *   3. ERROR     the element's own `error` event. Immediate; there is nothing to
 *                wait for.
 *
 * All three land in the same place — the dashboard — because none of them is the
 * customer's fault and all of them have the same remedy. `ended` lands there too.
 * `finish` runs once and the reason is reported, so a run can say WHICH of the
 * four ended it rather than only that something did.
 */

/** No `playing` by now and the film is not coming. Measured from the click. */
const START_DEADLINE_MS = 2500

/** `currentTime` frozen this long, mid-playback, is a stall and not a pause. */
const STALL_MS = 2500

/** How often the progress watchdog looks. Cheap; 40 wakes across the whole film. */
const POLL_MS = 250

export type BootVideoPhase = 'idle' | 'playing' | 'finished'

/**
 * Which audio branch ran. `unmuted` is the outcome the ruling asks for;
 * `muted-fallback` is the browser refusing and us carrying on rather than
 * leaving a black screen. `none` means the film never played at all.
 */
export type BootAudioPath = 'none' | 'unmuted' | 'muted-fallback'

/** Why it ended. Reported, never rendered — a customer is not told a watchdog fired. */
export type BootEndReason = 'ended' | 'start-timeout' | 'stalled' | 'error' | 'blocked'

export interface UseBootVideoArgs {
  /** Called once, whatever ended it. The caller navigates; this hook never does. */
  onFinished: (reason: BootEndReason) => void
}

export function useBootVideo({ onFinished }: UseBootVideoArgs) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [phase, setPhase] = useState<BootVideoPhase>('idle')

  /**
   * Refs, not state, for everything a watchdog reads.
   *
   * A timer that fires between a `setState` and its render would read the
   * previous value and abandon a film that had already started — the failure
   * would be a one-in-fifty flicker, which is the hardest kind to be shown.
   */
  const finishedRef = useRef(false)
  const audioPathRef = useRef<BootAudioPath>('none')
  const startTimer = useRef<number | null>(null)
  const pollTimer = useRef<number | null>(null)
  const lastTime = useRef(0)
  const lastAdvanceAt = useRef(0)

  const [audioPath, setAudioPath] = useState<BootAudioPath>('none')
  const [endReason, setEndReason] = useState<BootEndReason | null>(null)

  const clearTimers = useCallback(() => {
    if (startTimer.current !== null) window.clearTimeout(startTimer.current)
    if (pollTimer.current !== null) window.clearInterval(pollTimer.current)
    startTimer.current = null
    pollTimer.current = null
  }, [])

  /**
   * The single exit. Idempotent by ref, because two watchdogs can fire in the
   * same tick as `ended` and a double call would navigate twice.
   */
  const finish = useCallback(
    (reason: BootEndReason) => {
      if (finishedRef.current) return
      finishedRef.current = true
      clearTimers()
      setEndReason(reason)
      setPhase('finished')
      // Stop fetching a film nobody is watching. `pause` alone leaves the
      // download running on a connection we already know is struggling.
      const video = videoRef.current
      if (video) {
        try {
          video.pause()
        } catch {
          // A detached element. Nothing to stop.
        }
      }
      onFinished(reason)
    },
    [clearTimers, onFinished],
  )

  /** Watchdog 2. Armed only once frames are genuinely moving. */
  const armProgressWatchdog = useCallback(() => {
    if (pollTimer.current !== null) return
    lastAdvanceAt.current = Date.now()
    lastTime.current = videoRef.current?.currentTime ?? 0
    pollTimer.current = window.setInterval(() => {
      if (finishedRef.current) return
      const video = videoRef.current
      /**
       * THE ELEMENT WENT AWAY WHILE IT WAS PLAYING.
       *
       * This used to `return`, which is the one shape of failure no watchdog
       * covered: an unmounted `<video>` fires no `ended` and no `error`, and the
       * start deadline has already been disarmed by `playing`. The poll then
       * spins forever against a null ref and `onFinished` never runs — the
       * customer is left wherever the unmount put them, with a saved Brand Brain
       * and nothing to press.
       *
       * The stage no longer unmounts it mid-play, so this should be unreachable.
       * It is here because "should be unreachable" is what the previous version
       * of this line assumed.
       */
      if (!video) {
        finish('error')
        return
      }
      if (video.ended) return
      if (video.currentTime > lastTime.current) {
        lastTime.current = video.currentTime
        lastAdvanceAt.current = Date.now()
        return
      }
      if (Date.now() - lastAdvanceAt.current >= STALL_MS) finish('stalled')
    }, POLL_MS)
  }, [finish])

  /**
   * START. Synchronous, and called from inside the click handler.
   *
   * Returns nothing and awaits nothing: the caller must not be tempted to
   * `await` it, because the first `await` in that handler is where the gesture
   * — and with it the sound — is lost.
   */
  const start = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      // Nothing mounted to play. Not a failure the customer should meet as a
      // black screen; it is the dashboard, now.
      finish('error')
      return
    }

    /**
     * ALREADY DEAD, SO DO NOT SHOW IT AT ALL.
     *
     * The element preloads from the moment the result step is reached, which
     * means a file that cannot be fetched has usually failed BEFORE this button
     * is pressed — `video.error` is set and there is nothing to wait for.
     *
     * Without this the overlay still appears, covers the screen, and holds for
     * the full 2.5s start deadline before giving up. The watchdog would rescue
     * them, so it is not a dead end; it is two and a half seconds of a
     * brand-coloured rectangle for somebody whose connection is already having a
     * bad day. Finishing here costs them nothing and shows them nothing.
     *
     * MEASURED: 11,061ms → under 8s once the blocked-file test stopped letting
     * the file cache before it blocked it.
     */
    if (video.error) {
      finish('error')
      return
    }

    setPhase('playing')
    finishedRef.current = false

    // Watchdog 1, armed from the CLICK rather than from any media event, so a
    // file that never answers is still bounded.
    startTimer.current = window.setTimeout(() => {
      if (!finishedRef.current) finish('start-timeout')
    }, START_DEADLINE_MS)

    // Explicit rather than assumed: the element may have been muted by an
    // earlier fallback in this session, and a second run must ask for sound
    // again instead of inheriting a refusal.
    video.muted = false
    video.volume = 1

    const attempt = video.play()
    if (!attempt) {
      // Old-style synchronous play(). No promise to learn from; the media
      // events decide.
      audioPathRef.current = 'unmuted'
      setAudioPath('unmuted')
      return
    }

    attempt.then(
      () => {
        audioPathRef.current = 'unmuted'
        setAudioPath('unmuted')
      },
      () => {
        // The browser refused SOUND, not video. Mute and go again — a silent
        // film is a worse outcome than a loud one and a far better outcome than
        // a black screen with no way past it.
        const retryTarget = videoRef.current
        if (!retryTarget || finishedRef.current) return
        retryTarget.muted = true
        const retry = retryTarget.play()
        audioPathRef.current = 'muted-fallback'
        setAudioPath('muted-fallback')
        if (retry) {
          retry.catch(() => {
            // Refused twice. There is no third thing to try, and the start
            // deadline would catch this anyway — this only makes it immediate.
            finish('blocked')
          })
        }
      },
    )
  }, [finish])

  /* ── the element's own events ─────────────────────────────────────────── */

  const onPlaying = useCallback(() => {
    if (finishedRef.current) return
    if (startTimer.current !== null) {
      window.clearTimeout(startTimer.current)
      startTimer.current = null
    }
    armProgressWatchdog()
    /**
     * PERSISTED HERE, and the timing is the argument.
     *
     * Not on the click — that would mark a film that never loaded, and the
     * person whose connection dropped would never be given it again. Not on
     * `ended` — closing the tab at nine seconds would replay all ten. `playing`
     * is the event that means frames reached a screen.
     *
     * Fire-and-forget on purpose: the film is already running and nothing about
     * this screen may wait on a round trip. A failure is logged server-side by
     * the action; the worst it costs is one repeat.
     */
    void markBootVideoSeen()
  }, [armProgressWatchdog])

  const onEnded = useCallback(() => finish('ended'), [finish])
  const onError = useCallback(() => finish('error'), [finish])

  /**
   * TAKE IT BACK DOWN WITHOUT FINISHING.
   *
   * The one caller is the save failing while the film runs. That is not an end
   * to the animation, it is the animation having been started for a journey
   * that is not going to happen — so `onFinished` must NOT fire (there is
   * nowhere to navigate) and the overlay must come off the result card so the
   * error underneath can be read and the button pressed again.
   *
   * Deliberately not `finish('error')`: that would send someone to a dashboard
   * while their Brand Brain sits unsaved.
   */
  const abort = useCallback(() => {
    clearTimers()
    finishedRef.current = false
    const video = videoRef.current
    if (video) {
      try {
        video.pause()
        video.currentTime = 0
      } catch {
        // Detached, or a source that never opened. Nothing to rewind.
      }
    }
    setPhase('idle')
  }, [clearTimers])

  // Timers outlive a component that navigated away mid-film. Clearing them is
  // not tidiness: a stall watchdog firing after unmount would call `onFinished`
  // against a router that has already moved.
  useEffect(() => clearTimers, [clearTimers])

  return {
    videoRef,
    phase,
    audioPath,
    endReason,
    start,
    abort,
    onPlaying,
    onEnded,
    onError,
  }
}
