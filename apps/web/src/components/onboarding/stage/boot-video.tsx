'use client'

import type { RefObject } from 'react'

/** The founder's file, served from `apps/web/public`. */
export const BOOT_VIDEO_SRC = '/sahodaboot.mp4'
export const BOOT_VIDEO_POSTER = '/sahodaboot-poster.jpg'

export interface BootVideoProps {
  videoRef: RefObject<HTMLVideoElement | null>
  /** True once the click has fired. Drives the fade and the hit-testing. */
  active: boolean
  onPlaying: () => void
  onEnded: () => void
  onError: () => void
}

/**
 * THE BOOT ANIMATION, as a screen.
 *
 * ── IT IS MOUNTED BEFORE IT IS NEEDED, AND THAT IS THE POINT ────────────────
 * Rendered from the moment the result step is reached, invisible, with
 * `preload="auto"`. Two reasons, and the second is the load-bearing one:
 *
 *   · the bytes are already arriving when the button is pressed, so the film
 *     starts on the click rather than after a download;
 *   · `play()` has to be called inside that click's own call stack to keep the
 *     audio permission, and an element created in the same tick has nothing to
 *     play. See `use-boot-video.ts`.
 *
 * It is mounted at the RESULT step and not earlier. `preload="auto"` on the
 * intro screen would pull 2.7 MB down the wire behind a customer who is still
 * typing their brand name, on a connection this product cannot see.
 *
 * ── THERE IS NO SKIP, AND THE MARKUP IS WHERE THAT IS TRUE ──────────────────
 * The ruling is that it plays. So: no `controls`, `tabIndex={-1}` so it cannot
 * be focused or reached by Tab, and `pointer-events-none` on the video itself
 * with the overlay above it swallowing clicks. A click during playback lands on
 * a `<div>` with no handler and does nothing at all — it does not pause, does
 * not seek, does not advance.
 *
 * `aria-hidden` and no focusable child, because a screen reader announcing an
 * unlabelled video it cannot control is noise. The `<dialog>`-style trappings a
 * modal would carry are deliberately absent: this is not something to interact
 * with, it is something that happens.
 *
 * ── THE GROUND IS A TOKEN, NOT BLACK ────────────────────────────────────────
 * The film is 16:9 and the viewport is not, so something shows around it — on a
 * 390px phone, most of the screen. `bg-s1` is the same ground onboarding has
 * been painting for nine steps, so the film arrives ON the product rather than
 * over a black rectangle that reads as a broken embed. `object-contain` keeps
 * the whole frame: cropping a brand animation to fill a phone cuts the mark out
 * of its own logo.
 */
export function BootVideo({ videoRef, active, onPlaying, onEnded, onError }: BootVideoProps) {
  return (
    <div
      aria-hidden="true"
      data-boot-video
      data-active={active ? 'true' : 'false'}
      className={[
        'fixed inset-0 z-[200] grid place-items-center bg-s1',
        'transition-opacity duration-[220ms] ease-out',
        // `pointer-events-auto` while active is what swallows a click. Without
        // it the press would land on the result card underneath and fire the
        // button again.
        active ? 'opacity-100 pointer-events-auto' : 'pointer-events-none opacity-0',
      ].join(' ')}
    >
      <video
        ref={videoRef}
        // Not `autoPlay`: the whole audio argument depends on playback starting
        // from a click, and an autoplaying video would be muted by policy before
        // the button was ever pressed.
        preload="auto"
        // iOS takes a playing <video> fullscreen without this, which replaces
        // the app with the system player and its own controls — a skip button
        // arriving by way of the operating system.
        playsInline
        poster={BOOT_VIDEO_POSTER}
        tabIndex={-1}
        onPlaying={onPlaying}
        onEnded={onEnded}
        onError={onError}
        className="pointer-events-none h-full w-full object-contain"
      >
        {/* MP4 only, and stated rather than left to be inferred: the founder
            supplies `sahodaboot.mp4` and no WebM exists. A <source> pointing at
            a file that is not there costs every viewer a failed request before
            the fallback, so the fallback is the only entry. H.264 + AAC in an
            MP4 plays in every browser this product supports. */}
        <source src={BOOT_VIDEO_SRC} type="video/mp4" />
      </video>
    </div>
  )
}
