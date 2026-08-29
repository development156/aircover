'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { extractPalette } from '@/lib/brand/color-extract'
import { Button } from '@/components/ui/button'

/**
 * The customer's logo in the topbar, and the one control that changes their
 * brand colour.
 *
 * ── WHY IT IS A BUTTON AND NOT A PICTURE ────────────────────────────────────
 * Founder's ruling, 2026-08-29. Brand Skin chose a workspace's primary colour on
 * its own, taking the most frequent colour in the logo — which for a logo that
 * is mostly grey and white is grey, so the product went washed out while the
 * blue that anybody would have picked sat second in the list. "Making this
 * automatic can also cause problem in UI" is exactly right, and the answer is
 * not a cleverer guess. It is letting the person who owns the brand say which
 * colour it is.
 *
 * ── AND WHY THE PALETTE IS READ AGAIN HERE ──────────────────────────────────
 * Nothing stores the full palette: `workspace_themes` keeps the derived tokens,
 * and the file it came from is in the assets library. Rather than add a column
 * for it, the logo is read again in the browser when this opens, which is the
 * same `extractPalette` onboarding uses and costs one image load.
 *
 * The signed link is cross-origin, so the canvas can only be read when storage
 * returns permissive CORS headers. If it cannot, the swatches are honestly
 * absent and replacing the logo is offered instead, because that path carries
 * its own bytes and never needs the canvas to cooperate. UNVERIFIED IN A REAL
 * BROWSER at the time of writing: this sandbox has no working one.
 */
export function BrandMark({
  logoUrl,
  primary,
}: {
  /** A signed link to the workspace's logo, or null when there is none. */
  logoUrl: string | null
  /** The colour in use now, for the chip when there is no logo to show. */
  primary: string | null
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [palette, setPalette] = useState<string[] | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const [busy, startTransition] = useTransition()

  async function readTheLogo(): Promise<void> {
    if (!logoUrl || palette) return
    try {
      const img = await load(logoUrl, true)
      const found = extractPalette(img)
      if (found.length === 0) setUnreadable(true)
      else setPalette(found)
    } catch {
      // A tainted canvas and a dead link are the same outcome to the reader:
      // the colours cannot be offered. Replacing the logo still can be.
      setUnreadable(true)
    }
  }

  function choose(color: string): void {
    startTransition(async () => {
      const rest = (palette ?? []).filter((c) => c !== color)
      const { saveWorkspaceTheme } = await import('@/app/actions/theme')
      await saveWorkspaceTheme([color, ...rest])
      setOpen(false)
      router.refresh()
    })
  }

  async function replace(file: File): Promise<void> {
    startTransition(async () => {
      try {
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
        setOpen(false)
        router.refresh()
      } catch {
        setUnreadable(true)
      }
    })
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Your brand"
        data-guide="topbar.brand"
        onClick={() => {
          setOpen((was) => !was)
          void readTheLogo()
        }}
        className="surface-ring grid h-8 min-w-8 place-items-center overflow-hidden rounded-control bg-s2 px-1.5"
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

      {open ? (
        <div
          role="dialog"
          aria-label="Your brand colour"
          /* `absolute`, `z-15`, matching the workspace switcher beside it. The
             topbar carries `glass`, and `backdrop-filter` makes it a containing
             block AND a stacking context: a `fixed` child would be trapped
             inside it (the palette trap, apps/web/CLAUDE.md) and a lower z would
             let a sibling in the same row cover this panel. Absolute is correct
             here because this hangs off its button rather than covering the
             viewport. */
          className="surface-ring-firm absolute top-[calc(100%+8px)] left-0 z-15 w-[280px] rounded-card bg-surface p-3 shadow-pop"
        >
          <p className="type-sm text-ink">Your brand colour</p>
          <p className="type-xs mt-1 text-muted">
            Sahoda picks the colour it saw most of. Choose a different one and every button and link
            follows it. Your light and dark theme do not change.
          </p>

          {palette && palette.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  disabled={busy}
                  onClick={() => choose(color)}
                  aria-label={`Use this colour`}
                  className="surface-ring size-8 rounded-control"
                  style={{ background: color }}
                />
              ))}
            </div>
          ) : null}

          {unreadable ? (
            <p className="type-xs mt-3 text-muted">
              Sahoda could not read the colours out of your logo from here. Add it again below and
              it will read them as the file uploads.
            </p>
          ) : null}

          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void replace(file)
            }}
          />
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
              {logoUrl ? 'Replace logo' : 'Add a logo'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
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
