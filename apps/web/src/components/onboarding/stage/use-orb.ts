'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { mountOrb, type OrbHandle } from './orb'
import { capLabel, signalIds, type OnboardingData } from './store'

export interface OrbCaption {
  label: string
  count: number
}

/**
 * Mounts the orb, keeps its density honest, and moves it between the two slots.
 *
 * The density is not decorative: one particle is one signal the user actually
 * gave. This hook diffs the signal ids between renders and absorbs exactly the
 * NEW ones — so removing a reference does not fly a particle in, and a resumed
 * session does not re-absorb everything it already holds.
 */
export function useOrb(data: OnboardingData, reduced: boolean, initialEnergy: number) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<OrbHandle | null>(null)
  const seenRef = useRef<Set<string> | null>(null)
  const [caption, setCaption] = useState<OrbCaption | null>(null)

  // Mount once. The canvas is created here rather than by React, because React
  // must not own a node that gets moved between two parents.
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.id = 'orb'
    canvas.setAttribute('aria-hidden', 'true')
    canvasRef.current = canvas
    handleRef.current = mountOrb(canvas, { reduced, energy: initialEnergy })
    return () => {
      handleRef.current?.destroy()
      handleRef.current = null
      canvas.remove()
    }
    // Mount-only on purpose: re-running this would throw away every particle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * The palette is read from tokens, so it has to be re-read when the theme
   * attribute flips. Without this the orb keeps the light palette across the
   * toggle and the facet pills stay white on a near-black page.
   */
  useEffect(() => {
    const observer = new MutationObserver(() => handleRef.current?.refreshPalette())
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    return () => observer.disconnect()
  }, [])

  // Density and energy follow the answers.
  useEffect(() => {
    const ids = signalIds(data)
    const now = new Set(ids)

    // First pass after mount adopts the resumed state WITHOUT animating it in:
    // a resumed session already holds those signals, and flying twelve
    // particles in would stage an arrival that is not happening.
    if (seenRef.current === null) {
      seenRef.current = now
      handleRef.current?.setEnergy(Math.min(1, ids.length / 24))
      return
    }

    const previous = seenRef.current
    const fresh = ids.filter((id) => !previous.has(id))
    seenRef.current = now

    handleRef.current?.setEnergy(Math.min(1, ids.length / 24))
    if (fresh.length === 0) return

    handleRef.current?.absorb(fresh.length)
    const last = fresh[fresh.length - 1]
    if (last) setCaption({ label: capLabel(last), count: ids.length })
  }, [data])

  // The receipt is transient. 2,600ms, the source's timing.
  useEffect(() => {
    if (!caption) return
    const id = setTimeout(() => setCaption(null), 2600)
    return () => clearTimeout(id)
  }, [caption])

  /**
   * Move the canvas into a slot and re-measure.
   *
   * The re-measure happens even when the canvas is ALREADY in that slot,
   * because the slot's box can change without the canvas moving — the
   * processing screen is `display: none` until it is `.on`, so the first
   * measurement taken while it is hidden is 0x0. See the caller.
   */
  const moveTo = useCallback((slot: HTMLElement | null) => {
    const canvas = canvasRef.current
    if (!canvas || !slot) return
    if (canvas.parentElement !== slot) slot.appendChild(canvas)
    handleRef.current?.resize()
  }, [])

  return { orb: handleRef, caption, moveTo }
}
