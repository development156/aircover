'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'

/**
 * The brand panel: the colours found in the logo, and the way to replace it.
 *
 * ── ITS OWN MODULE BECAUSE OF WHAT THE SHELL COSTS ──────────────────────────
 * `BrandMark` renders on every route, so anything it imports is downloaded on
 * every route. With this panel inline, `/(app)/layout` went 9.8 kB over the
 * js-budget and the production build FAILED — correctly. Deferring the colour
 * extractor alone recovered 1.8 kB of that; the rest was this markup, its state
 * and the button, in the bundle of every page for a panel most visits never
 * open.
 *
 * `next/dynamic` with `ssr: false` puts it in a chunk fetched on the first
 * press. Nothing renders it server-side, which is right: it is a menu, it has
 * no content until a person asks for it, and a spinner in its place would be a
 * claim that something is loading before anybody wanted it.
 */
export function BrandPanel({
  logoUrl,
  skinOn,
  hasTheme,
  onToggleSkin,
  onUseBrand,
  onClose,
}: {
  logoUrl: string | null
  /** Whether the customer's colours are painting the product right now. */
  skinOn: boolean
  /** Whether a brand has been stored at all. With none, there is nothing to switch to. */
  hasTheme: boolean
  onToggleSkin: () => void
  /** Turn the brand colours ON, for the acts that mean exactly that. */
  onUseBrand: () => void
  onClose: () => void
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [palette, setPalette] = useState<string[] | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const [busy, startTransition] = useTransition()
  const [read, setRead] = useState(false)

  if (!read) {
    setRead(true)
    void (async () => {
      if (!logoUrl) return
      try {
        const img = await load(logoUrl, true)
        const { extractPalette } = await import('@/lib/brand/color-extract')
        const found = extractPalette(img)
        if (found.length === 0) setUnreadable(true)
        else setPalette(found)
      } catch {
        // A tainted canvas and a dead link are the same outcome to the reader:
        // the colours cannot be offered. Replacing the logo still can be.
        setUnreadable(true)
      }
    })()
  }

  function choose(color: string): void {
    startTransition(async () => {
      const rest = (palette ?? []).filter((c) => c !== color)
      const { saveWorkspaceTheme } = await import('@/app/actions/theme')
      await saveWorkspaceTheme([color, ...rest])
      // Choosing a colour IS asking for it, so it takes effect rather than being
      // stored against a switch the person has not met.
      onUseBrand()
      onClose()
      router.refresh()
    })
  }

  function replace(file: File): void {
    startTransition(async () => {
      try {
        const { extractPalette } = await import('@/lib/brand/color-extract')
        const found = extractPalette(await load(URL.createObjectURL(file), false))
        const form = new FormData()
        form.set('file', file)
        form.set('title', 'Logo')
        const { uploadAsset } = await import('@/app/actions/assets')
        await uploadAsset(form)

        if (found.length > 0) {
          const { saveWorkspaceTheme } = await import('@/app/actions/theme')
          await saveWorkspaceTheme(found)
          setPalette(found)
          setUnreadable(false)
        } else {
          // The file is KEPT either way. A logo Sahoda cannot read colours from
          // is still their logo, and saying nothing about the colours is more
          // honest than painting the workspace in whatever a failed read left.
          setUnreadable(true)
        }
        onClose()
        router.refresh()
      } catch {
        setUnreadable(true)
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-label="Your brand colour"
      /* `absolute`, `z-15`, matching the workspace switcher beside it. The
         topbar carries `glass`, and `backdrop-filter` makes it a containing
         block AND a stacking context: a `fixed` child would be trapped inside it
         (the palette trap, apps/web/CLAUDE.md) and a lower z would let a sibling
         in the same row cover this panel. Absolute is correct here because this
         hangs off its button rather than covering the viewport. */
      className="surface-ring-firm absolute top-[calc(100%+8px)] left-0 z-15 w-[280px] rounded-card bg-surface p-3 shadow-pop"
    >
      <p className="type-sm text-ink">Your brand colour</p>
      {/* THE CLAIM TRACKS THE MECHANISM, WHICH HAS MOVED TWICE IN A DAY. It once
          read "every button and link follows it" while the paint was
          unconditional, then named two places while it was confined to the mark.
          Both were true when written and false a few hours later. What is true
          now: the colour paints the product WHILE the switch is on, and the
          light and dark themes are a different switch. */}
      <p className="type-xs mt-1 text-muted">
        Sahoda picks the colour it saw most of. Choose a different one and your buttons and links
        follow it while your brand colours are switched on. Light and dark stay on the moon.
      </p>

      {/* ── THE SWITCH, STATED AS WHAT IT IS ────────────────────────────────────
          Pressing the logo does this too. It is repeated here because a person
          who opened the menu to fix an unreadable screen should not have to
          guess that the way out is the button they just walked past, and because
          this is the only place that can say which state they are in. */}
      {hasTheme ? (
        <div className="surface-ring mt-3 flex items-center justify-between gap-2 rounded-control p-2">
          <span className="type-xs text-ink">
            {skinOn ? 'Your brand colours are on' : 'Sahoda colours are on'}
          </span>
          <Button variant="secondary" disabled={busy} onClick={onToggleSkin}>
            {skinOn ? 'Use Sahoda colours' : 'Use my colours'}
          </Button>
        </div>
      ) : null}

      {palette && palette.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {palette.map((color) => (
            <button
              key={color}
              type="button"
              disabled={busy}
              onClick={() => choose(color)}
              aria-label="Use this colour"
              className="surface-ring size-8 rounded-control"
              style={{ background: color }}
            />
          ))}
        </div>
      ) : null}

      {unreadable ? (
        <p className="type-xs mt-3 text-muted">
          Sahoda could not read the colours out of your logo from here. Add it again below and it
          will read them as the file uploads.
        </p>
      ) : null}

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) replace(file)
        }}
      />
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          {logoUrl ? 'Replace logo' : 'Add a logo'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

/**
 * `crossOrigin` only for the signed remote link. An object URL is same-origin
 * and setting it there is unnecessary; setting it on a host that does not send
 * the header is what taints the canvas rather than what fixes it.
 */
function load(url: string, remote: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (remote) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'))
    img.src = url
  })
}
