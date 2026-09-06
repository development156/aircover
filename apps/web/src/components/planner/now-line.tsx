'use client'

import { useEffect, useState } from 'react'

import { minutesIntoDay } from '@/lib/time/day-key'

/**
 * The current-time rule.
 *
 * ── WHY THIS IS A CLIENT COMPONENT ───────────────────────────────────────────
 * A server-rendered "now" is the time the PAGE was built, and this product's
 * whole discipline is that a rendered figure is a real reading. A line labelled
 * "now" that is forty minutes stale is a wrong reading with a confident label,
 * and nothing on the screen would say so. So it reads the browser clock and
 * re-reads it every minute.
 *
 * It renders nothing at all until the first client tick, which means the server
 * HTML carries no time claim rather than a claim that is about to be wrong.
 *
 * ── THE INSTANT IS THE BROWSER'S; THE ROW IS THE WORKSPACE'S ─────────────────
 * "Now" is an instant and every clock agrees on it. Which ROW that instant sits
 * on depends on the zone the grid is drawn in, so the zone comes down as a prop
 * from the page that resolved it, and the line lands on the same row a card
 * scheduled for this minute would.
 */
export function NowLine({
  zone,
  fromHour,
  toHour,
  hourPx,
}: {
  /** The zone the grid is drawn in. */
  zone: string
  fromHour: number
  toHour: number
  hourPx: number
}) {
  const [minutes, setMinutes] = useState<number | null>(null)

  useEffect(() => {
    const tick = (): void => setMinutes(minutesIntoDay(zone, new Date()))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [zone])

  if (minutes === null) return null
  // Outside the drawn range there is no honest place to put it.
  if (minutes < fromHour * 60 || minutes > toHour * 60) return null

  const top = ((minutes - fromHour * 60) / 60) * hourPx

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
      style={{ top }}
    >
      <span className="size-2 shrink-0 rounded-pill bg-brand" />
      <span className="h-px flex-1 bg-brand" />
    </div>
  )
}
