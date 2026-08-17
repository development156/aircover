'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

const KEY = 'sahoda-theme'

/**
 * The dark-mode switch, beside the avatar (reference `.hdr` right cluster).
 *
 * ── WHY THIS IS A STRUCTURAL DEFECT AND NOT A FEATURE REQUEST ────────────────
 * The dark theme was already finished before this component existed. tokens.css
 * carries a complete dark block, globals.css keys the `dark:` variant to it, and
 * 48 components already ship dark: variants. All of it was unreachable, because
 * nothing in the app could ever set the attribute. The design existed; only the
 * control was missing. SPECIFICATION.md §13 lists the theme toggle in Phase 1 of
 * the shell, next to the layout frame and live badges.
 *
 * ── THREE STATES, TWO ICONS ──────────────────────────────────────────────────
 * Stored 'light' and 'dark' are explicit and always win. No stored value is the
 * third state and means "follow the OS", which is why this reads the RESOLVED
 * theme off the document rather than off storage — the inline ThemeScript has
 * already decided, and asking storage again would answer null for the majority
 * of users and render the wrong icon.
 *
 * The icon shows the DESTINATION, not the current state: a moon means "go dark".
 * Both readings are defensible and neither is guessable from the glyph alone,
 * which is why the accessible name says it in words.
 */
export function ThemeToggle() {
  // Rendered by the server as light, then corrected on mount. `mounted` exists
  // because the server cannot know the answer: the theme lives in localStorage
  // and in an OS preference, neither of which exists during SSR. Rendering the
  // real icon before mount would be a hydration mismatch on every dark-mode
  // user's first paint.
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    setMounted(true)
  }, [])

  function toggle() {
    const next = isDark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Private mode, or storage disabled. The theme still applies to this
      // document; it just will not survive a reload. Losing persistence is not
      // a reason to refuse the switch.
    }
    setIsDark(!isDark)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-guide="topbar.theme"
      // Until mounted the state is unknown, so the name must not claim one.
      aria-label={
        mounted ? (isDark ? 'Switch to light theme' : 'Switch to dark theme') : 'Switch theme'
      }
      // flex-none for the same reason as the two chips beside it: a topbar item
      // that can shrink is a topbar item that wraps.
      className="grid size-8 flex-none place-items-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink active:scale-[.97] max-narrow:size-11"
    >
      {mounted && isDark ? (
        <Sun size={17} strokeWidth={1.7} aria-hidden />
      ) : (
        <Moon size={17} strokeWidth={1.7} aria-hidden />
      )}
    </button>
  )
}
