'use client'

import { useState } from 'react'

/**
 * Removes hue from the whole document.
 *
 * The palette is one orange with no red and no green, so every state has to
 * carry its meaning in fill, edge, texture, glyph or word. This is how that
 * claim gets checked rather than asserted: if two things become ambiguous with
 * the colour gone, the system is wrong.
 *
 * It writes a class on <html> rather than filtering a wrapper, because a filter
 * on an ancestor creates a containing block and would move every `position:
 * fixed` element on the page — which would make the toggle itself a source of
 * layout bugs.
 */
export function GreyscaleToggle() {
  const [grey, setGrey] = useState(false)

  function toggle() {
    const next = !grey
    setGrey(next)
    document.documentElement.classList.toggle('ds-greyscale', next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={grey}
      data-testid="greyscale-toggle"
      className="mt-4 inline-flex h-control items-center rounded-sm border border-line px-3 text-[13px] font-semibold transition-micro hover:bg-s2 max-narrow:min-h-[44px]"
    >
      {grey ? 'Restore colour' : 'View in greyscale'}
    </button>
  )
}
