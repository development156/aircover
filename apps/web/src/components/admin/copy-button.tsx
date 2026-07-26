'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Copy to clipboard, with an honest failure.
 *
 * `navigator.clipboard` is not always there — it needs a secure context, and the
 * browser can refuse the permission outright. A button that flashes "Copied"
 * regardless would be a fake success on the one action whose whole purpose is
 * that something is now in the clipboard, and the reader would find out by
 * pasting nothing into WhatsApp.
 */
type State = 'idle' | 'copied' | 'failed'

const RESET_AFTER_MS = 2000

export function CopyButton({
  text,
  label,
  className,
}: {
  /** Resolved lazily so a long day's worth is only built when asked for. */
  text: () => string
  label: string
  className?: string
}) {
  const [state, setState] = useState<State>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A click, then an unmount before the reset, would set state on a gone
  // component. The rail re-renders on every ingest, so this is routine here.
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), [])

  async function copy() {
    if (timer.current) clearTimeout(timer.current)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(text())
      setState('copied')
    } catch {
      setState('failed')
    }
    timer.current = setTimeout(() => setState('idle'), RESET_AFTER_MS)
  }

  return (
    <button
      type="button"
      onClick={copy}
      // Announced, not just recoloured: the label is the only feedback, and a
      // colour change alone says nothing to a screen reader.
      aria-live="polite"
      className={cn(
        'rounded-input px-2 py-[3px] text-[11px] font-medium transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        state === 'idle' && 'text-muted hover:bg-s2 hover:text-ink',
        state === 'copied' && 'text-ok',
        state === 'failed' && 'text-danger',
        className,
      )}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy" : label}
    </button>
  )
}
