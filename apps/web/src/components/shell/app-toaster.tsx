'use client'

import { Toaster } from 'sonner'

/**
 * The one toaster, dressed in the product's own tokens.
 *
 * ── 46 PIECES OF FEEDBACK THAT LOOKED LIKE ANOTHER PRODUCT ───────────────────
 * `toast.success` and `toast.error` are called from 26 files, and both mounts
 * rendered sonner's stock look: its own font stack, its own greys, its own
 * radius, and a light/dark decision read from the OS rather than from the
 * `data-theme` attribute this app is actually switched by. So a "Saved" that
 * followed a brand-styled button arrived in a different typeface on a surface
 * from a different palette — and on /admin it also sat under the bottom bar on
 * a phone, because that mount was never given the offsets the app one has.
 *
 * Sonner reads a small set of custom properties for its surfaces, so pointing
 * those at `--surface`, `--ink` and `--line` makes every toast follow the
 * theme automatically: the tokens flip with `data-theme`, and the toaster's
 * own theme flag is pinned so it stops second-guessing them from the OS.
 *
 * No `richColors`. Severity here is carried by the glyph and the sentence, as
 * `badge.tsx` explains at length — this palette has no red or green, and a
 * green toast beside a black "Published" chip would be the one place the two
 * disagreed.
 */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-left"
      theme="light"
      // Lifted clear of the bottom bar on a phone, or it covers the tabs.
      offset={{ bottom: 16 }}
      mobileOffset={{ bottom: 72 }}
      style={
        {
          fontFamily: 'var(--sans)',
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--ink)',
          '--normal-border': 'var(--line)',
          '--success-bg': 'var(--surface)',
          '--success-text': 'var(--ink)',
          '--success-border': 'var(--line)',
          '--error-bg': 'var(--surface)',
          '--error-text': 'var(--ink)',
          '--error-border': 'var(--line-firm)',
          '--warning-bg': 'var(--surface)',
          '--warning-text': 'var(--ink)',
          '--warning-border': 'var(--line-firm)',
          '--border-radius': 'var(--r)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'type-sm shadow-pop',
          title: 'font-[550]',
          description: 'text-muted',
        },
      }}
    />
  )
}
