'use client'

import { useEffect } from 'react'

/**
 * Put `data-theme` back if React has thrown it away.
 *
 * ── THE DEFECT, MEASURED ─────────────────────────────────────────────────────
 * `ThemeScript` writes the attribute in <head> before first paint, and on every
 * ordinary route that is the end of the story. On the ROOT not-found boundary it
 * is not. Measured at 1440 in a session whose theme was dark:
 *
 *   /home                        data-theme="dark"  body rgb(11,11,12)
 *   /this-route-does-not-exist   data-theme=null    body rgb(255,255,255)
 *
 * with `localStorage['sahoda-theme'] === 'dark'` and the inline script present
 * in the document three times over. So the value was there, the script was
 * there, and the attribute was not: Next renders the not-found boundary by
 * re-rendering the root layout on the client rather than hydrating it, and a
 * re-rendered <html> keeps only the attributes React itself authored. The
 * script's is not one of them.
 *
 * The visible cost was a 404 that is light-only. Its light and dark frames were
 * byte-identical — md5 79189e65… for both at 1440 and 40e0c556… for both at 390
 * — while every other stop in the corpus differed between themes. A dark-mode
 * user who mistypes a URL gets a white screen.
 *
 * ── WHY A useEffect AND NOT A SECOND INLINE SCRIPT ───────────────────────────
 * A second inline script would run at the same moment as the first and be
 * discarded by the same re-render. This runs AFTER React has finished, which is
 * the only point at which the attribute survives.
 *
 * ── WHAT IT DOES NOT FIX ─────────────────────────────────────────────────────
 * On that one boundary the page paints light for a frame before this lands.
 * That is strictly better than painting light forever, and it is not the whole
 * repair: the durable fix is a `@media (prefers-color-scheme: dark)` block in
 * tokens.css guarded as `:root:not([data-theme='light'])`, so the palette is
 * right even when no script runs at all. That duplicates forty declarations and
 * needs a generator plus a sync test to stay honest, which is a lane of its own
 * — logged in the report rather than half-built here.
 *
 * It reads the SAME three states as ThemeScript and must keep doing so: stored
 * 'dark' or 'light' wins, and absence means follow the OS. Never simplify this
 * to "stored value or light" — a user who never opened the toggle should track
 * their system.
 */
export function ThemeAttributeGuard() {
  useEffect(() => {
    const root = document.documentElement
    if (root.getAttribute('data-theme') !== null) return
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem('sahoda-theme')
    } catch {
      /* private mode: fall through to the OS preference */
    }
    const dark =
      stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.setAttribute('data-theme', dark ? 'dark' : 'light')
  })

  return null
}
