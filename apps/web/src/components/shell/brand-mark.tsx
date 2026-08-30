'use client'

import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import {
  nextSkinState,
  skinStateFromStored,
  skinToggleLabel,
  SKIN_ATTR,
  SKIN_KEY,
  type SkinState,
} from '@/lib/brand/skin-preference'

/**
 * The customer's logo in the topbar, and the switch between their colours and
 * ours.
 *
 * ── TWO SWITCHES, AND THIS IS THE OTHER ONE ─────────────────────────────────
 * Founder's ruling, 2026-08-29. The moon and sun own Sahoda's platform theme,
 * light against dark, and never touch the brand. THIS owns Brand Skin, on
 * against off, and never touches light and dark. They compose: brand colours
 * over dark neutrals is a real and reachable combination, because only seven
 * tokens are themeable and every neutral belongs to the theme.
 *
 * The switch exists because an automatic colour read is a guess about somebody
 * else's brand. When the guess is wrong the interface becomes hard to read, and
 * the answer to that is a way out rather than a cleverer histogram.
 *
 * ── A SPLIT CONTROL, BECAUSE THERE ARE TWO THINGS TO DO ─────────────────────
 * Pressing the logo switches. That is the ruling, said plainly: one press, no
 * menu, instantly reversible. Choosing WHICH extracted colour is primary and
 * replacing the logo file are rarer and live behind the chevron beside it.
 * Putting the switch behind the menu too would have made the common act the
 * slower one.
 *
 * With no brand stored there is nothing to switch to, so the logo press opens
 * the panel instead — where "Add a logo" is. A toggle that toggles nothing is
 * worse than no toggle: it reports a state change that did not happen.
 *
 * ── THIS FILE STAYS SMALL ON PURPOSE ────────────────────────────────────────
 * It renders on EVERY route, so every byte it imports is downloaded on every
 * route. The first version carried the panel and the colour extractor inline and
 * put `/(app)/layout` 9.8 kB over the js-budget, which failed the production
 * build. That guard was right: most visits never open this.
 */
const BrandPanel = dynamic(() => import('./brand-panel').then((m) => m.BrandPanel), { ssr: false })

export function BrandMark({
  logoUrl,
  primary,
  hasTheme,
}: {
  /** A signed link to the workspace's logo, or null when there is none. */
  logoUrl: string | null
  /** The brand colour, for the chip when there is no logo picture to show. */
  primary: string | null
  /** Whether a brand has been stored at all. With none, there is nothing to switch to. */
  hasTheme: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const chevronRef = useRef<HTMLButtonElement>(null)

  /**
   * ── A DIALOG WITH NO WAY OUT BUT THE MOUSE ────────────────────────────────
   * `BrandPanel` renders `role="dialog"` and had no Escape handler, no outside
   * press, and nothing that returned focus. A keyboard user could open it and
   * then had to tab blindly past every control inside it to get back to the
   * page. `workspace-switcher.tsx`, three files along in this same directory,
   * has handled exactly this since it was written; the pattern was in the repo
   * and this control simply did not follow it.
   *
   * NOT `aria-modal`, and not a focus trap. Nothing about this panel is modal:
   * there is no scrim, the page behind it stays live, and it hangs off its own
   * button rather than covering the viewport. Claiming modality in the
   * accessibility tree would tell a screen reader the rest of the page is
   * inert when it is not, which is a worse lie than the silence it replaces.
   * It renders immediately after its trigger in the DOM, so Tab reaches it and
   * Tab leaves it, which is the correct behaviour for a popover.
   */
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Back to the control that opened it. Closing without this drops focus on
      // `<body>`, so the next Tab restarts at the top of the document.
      chevronRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  /**
   * Read from the DOCUMENT, not from storage, and only after mount.
   *
   * `ThemeScript` has already decided before the first paint, so the attribute
   * is the resolved answer and storage is merely where it came from. Rendering a
   * state during SSR would be a hydration mismatch on every visit that has the
   * skin on. `ThemeToggle` reads its own state the same way for the same reason.
   */
  const [skin, setSkin] = useState<SkinState>('off')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setSkin(skinStateFromStored(document.documentElement.getAttribute(SKIN_ATTR)))
    setMounted(true)
  }, [])

  function applySkin(next: SkinState): void {
    // The attribute IS the switch: `(app)/layout.tsx` always emits the brand
    // rule scoped to it, so writing it here repaints immediately with no round
    // trip, no revalidation and no flash.
    if (next === 'on') document.documentElement.setAttribute(SKIN_ATTR, 'on')
    else document.documentElement.removeAttribute(SKIN_ATTR)

    try {
      localStorage.setItem(SKIN_KEY, next)
    } catch {
      // Private mode, or storage disabled. The switch still applies to this
      // document; it just will not survive a reload. Losing persistence is not
      // a reason to refuse the switch. `ThemeToggle` makes the same call.
    }
    setSkin(next)
  }

  const toggleSkin = () => applySkin(nextSkinState(skin))

  const on = mounted && skin === 'on'

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-center">
      <button
        type="button"
        // A switch, so it reports its state rather than merely being pressable.
        // With no brand stored it is not a switch at all: it opens the panel, so
        // it must not claim a state it does not have.
        {...(hasTheme
          ? { 'aria-pressed': on, 'aria-label': mounted ? skinToggleLabel(skin) : 'Your brand' }
          : {
              'aria-haspopup': 'dialog' as const,
              'aria-expanded': open,
              'aria-label': 'Your brand',
            })}
        data-guide="topbar.brand"
        onClick={() => (hasTheme ? toggleSkin() : setOpen(true))}
        className="surface-ring grid h-8 min-w-8 place-items-center overflow-hidden rounded-l-control bg-s2 px-1.5 transition-micro hover:bg-s3 active:scale-[.97]"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-5 w-auto max-w-[88px] object-contain" />
        ) : (
          <span
            aria-hidden
            className="size-4 rounded-full"
            style={{ background: primary ?? 'var(--p)' }}
          />
        )}
      </button>

      {/* The rarer half: which colour is primary, and replacing the file. Its own
          button so the common act stays one press. `-ml-px` so the two share an
          edge and read as one control rather than as two beside each other. */}
      {/* `w-6`, not `w-5`. WCAG 2.5.8 asks 24x24 CSS pixels for a pointer
          target and this was 20 across — the smaller half of a split control,
          which is the half a shaky hand or a thumb misses. The height was
          already 32. One pixel column of the logo half pays for it. */}
      <button
        ref={chevronRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open brand options"
        onClick={() => setOpen((was) => !was)}
        className="surface-ring -ml-px grid h-8 w-6 place-items-center rounded-r-control bg-s2 text-muted transition-micro hover:bg-s3 hover:text-ink active:scale-[.97]"
      >
        <ChevronDown size={13} strokeWidth={1.8} aria-hidden />
      </button>

      {open ? (
        <BrandPanel
          logoUrl={logoUrl}
          current={primary}
          skinOn={on}
          hasTheme={hasTheme}
          onToggleSkin={toggleSkin}
          /* Picking a colour is a person saying "this is my brand colour", so
             it takes effect. Choosing one and watching nothing happen because a
             switch they have not met is off is the worse of the two surprises,
             and the way back is the same button they just used. */
          onUseBrand={() => applySkin('on')}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}
