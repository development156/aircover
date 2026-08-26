'use client'

import { useEffect, useState } from 'react'

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
 */
const IST = 'Asia/Kolkata'
const HOUR_MIN = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function istMinutesNow(): number | null {
  const [h, m] = HOUR_MIN.format(new Date()).split(':')
  const hours = Number(h)
  const mins = Number(m)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  return hours * 60 + mins
}

export function NowLine({
  fromHour,
  toHour,
  hourPx,
}: {
  fromHour: number
  toHour: number
  hourPx: number
}) {
  const [minutes, setMinutes] = useState<number | null>(null)

  useEffect(() => {
    const tick = (): void => setMinutes(istMinutesNow())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

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
      <span className="size-2 shrink-0 rounded-full bg-brand" />
      <span className="h-px flex-1 bg-brand" />
    </div>
  )
}
