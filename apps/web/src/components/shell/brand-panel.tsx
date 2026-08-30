'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  currentSwatchIndex,
  distinctBrandColors,
  isUsableBrandColor,
} from '@/lib/brand/brand-theme'
import { colorNames } from '@/lib/brand/color-name'
import { rgbToOklch } from '@/lib/brand/oklch'

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
  current,
  skinOn,
  hasTheme,
  onToggleSkin,
  onUseBrand,
  onClose,
}: {
  logoUrl: string | null
  /**
   * The primary the workspace is stored with, so the row can say which swatch is
   * the one in use. Guard-adjusted, which is why the lookup is by hue.
   */
  current: string | null
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
  /**
   * ── WHAT WENT WRONG, SHOWN ────────────────────────────────────────────────
   * `replace()` used to be `await uploadAsset(form)` with the result thrown
   * away. `uploadAsset` refuses a duplicate file, an oversized one, unreadable
   * bytes, a storage failure and a missing workspace, and every one of those
   * closed this panel and refreshed the page as though it had worked.
   *
   * MEASURED on the founder's own workspace: "Replace logo" appeared to do
   * nothing, over and over. The file was being refused as a DUPLICATE — it
   * matches by content hash against the copy already in the library — and the
   * refusal, which names the file and points at the trash, was discarded here.
   *
   * A silent failure is worse than a loud one on a control whose entire job is
   * to change something visible.
   */
  const [failed, setFailed] = useState<string | null>(null)
  /** An SVG was turned into a PNG. Said out loud rather than done quietly. */
  const [converted, setConverted] = useState(false)
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

  /**
   * ── ONLY THE COLOURS THAT CAN ACTUALLY BECOME A BRAND ────────────────────
   * MEASURED on the founder's logo, which is grey, white and black: all five
   * extracted swatches had chroma 0.0000, every one fell back to Sahoda orange,
   * and the panel offered five choices that could not do anything. Filtering by
   * the derivation's own predicate is the difference between a palette and a
   * row of decoys.
   */
  /**
   * ── AND ONLY ONCE EACH ────────────────────────────────────────────────────
   * The chroma filter above removes the greys and says nothing about whether the
   * survivors differ from each other. MEASURED on the founder's screenshot after
   * that fix: four swatches, all blue, all a shade apart. A logo drawn in one
   * colour at four opacities yields exactly that, and it is the five-decoys
   * defect again in a weaker form: four choices, one outcome.
   */
  const usable = distinctBrandColors((palette ?? []).filter(isUsableBrandColor))
  const names = colorNames(usable)
  const inUse = skinOn ? currentSwatchIndex(usable, current) : -1
  /** The logo was read successfully and simply has no colour in it. */
  const monochrome = palette !== null && palette.length > 0 && usable.length === 0

  function pick(hex: string): void {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    if (!m) return
    choose(rgbToOklch(parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)))
  }

  function choose(color: string): void {
    startTransition(async () => {
      // FROM THE USABLE LIST, and the test that found this is worth keeping in
      // mind: `colors[1]` becomes the ACCENT, and an unusable colour there falls
      // back to Sahoda orange. Carrying the greys along would have handed a
      // customer who picked teal an orange accent.
      const rest = usable.filter((c) => c !== color)
      setFailed(null)
      const { saveWorkspaceTheme } = await import('@/app/actions/theme')
      const saved = await saveWorkspaceTheme([color, ...rest])
      if (!saved.ok) {
        setFailed(saved.message)
        return
      }
      // Choosing a colour IS asking for it, so it takes effect rather than being
      // stored against a switch the person has not met.
      onUseBrand()
      onClose()
      router.refresh()
    })
  }

  /**
   * ── THE UPLOAD GOES FIRST, AND THAT ORDER IS THE FIX ────────────────────────
   * This used to read the palette from a canvas BEFORE calling the server, with
   * both inside one try. An adversarial review measured the consequence: a
   * browser that will not decode the file — an SVG with no `xmlns`, which is
   * common in hand-edited markup — rejects in `load()`, the catch fires, and
   * `setBrandLogo` is NEVER CALLED. No request, no rasterisation, no row, and a
   * message telling the person to try a PNG for a file the SERVER would have
   * accepted, since sharp rasterises it fine.
   *
   * That is the same "Replace logo does nothing" this commit set out to end,
   * rebuilt one layer up. So the file is STORED first, and reading colours out
   * of it is a separate, failable step afterwards: the logo is the point, the
   * palette is a bonus, and a bonus must never gate the point.
   */
  function replace(file: File): void {
    startTransition(async () => {
      setFailed(null)
      setConverted(false)

      const form = new FormData()
      form.set('file', file)
      form.set('title', 'Logo')

      let stored
      try {
        const { setBrandLogo } = await import('@/app/actions/brand-logo')
        stored = await setBrandLogo(form)
      } catch {
        setFailed('Sahoda could not save that file. Try again.')
        return
      }
      if (!stored.ok) {
        setFailed(stored.message)
        return
      }
      setConverted(stored.converted)

      /**
       * Colours, second and optional. A canvas read can fail for reasons that
       * have nothing to do with whether the file is a good logo — a namespace
       * the browser dislikes, a tainted canvas — and none of them is a reason to
       * discard a file that is already stored.
       */
      try {
        const { extractPalette } = await import('@/lib/brand/color-extract')
        const found = extractPalette(await load(URL.createObjectURL(file), false))
        if (found.length > 0) {
          const { saveWorkspaceTheme } = await import('@/app/actions/theme')
          const saved = await saveWorkspaceTheme(found)
          if (saved.ok) {
            setPalette(found)
            setUnreadable(false)
          }
        } else {
          setUnreadable(true)
        }
      } catch {
        // The file is KEPT. Saying nothing about the colours is more honest than
        // painting the workspace in whatever a failed read left behind.
        setUnreadable(true)
      }

      /**
       * The panel STAYS OPEN. Closing here made the "saved as an image" notice
       * unreachable — the flag was set in the same transition that unmounted the
       * component, so nobody ever saw it. Staying open is also better: the
       * swatches have just changed and choosing one is the likely next act.
       */
      router.refresh()
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
      {/* ── THE LOGO ITSELF, IN THE PANEL THAT REPLACES IT ────────────────────
          "Replace logo" sat in a panel that never showed what was being
          replaced. On a workspace whose mark is small, or wrong, or somebody
          else's, the person had to close this and look at the topbar to find
          out. It is the subject of every control below it. */}
      <div className="flex items-center gap-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Your logo"
            className="surface-ring h-7 w-auto max-w-[72px] shrink-0 rounded-control bg-s2 object-contain px-1"
          />
        ) : null}
        <p className="type-sm text-ink">Your brand colours</p>
      </div>
      {/* THE CLAIM TRACKS THE MECHANISM, WHICH HAS MOVED TWICE IN A DAY. It once
          read "every button and link follows it" while the paint was
          unconditional, then named two places while it was confined to the mark.
          Both were true when written and false a few hours later. What is true
          now: the colour paints the product WHILE the switch is on, and the
          light and dark themes are a different switch. */}
      <p className="type-xs mt-1 text-muted">
        Sahoda picked the colour it saw most of in your logo. Choose another and your buttons and
        links follow it while the brand is switched on.
      </p>

      {/* ── THE COLOURS COME FIRST ────────────────────────────────────────────
          The switch below used to sit here. Picking a colour is why almost
          anybody opens this; switching the whole thing off is the rare act, and
          it was the one in the first position. */}
      {usable.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {usable.map((color, index) => (
            <button
              key={color}
              type="button"
              disabled={busy}
              onClick={() => choose(color)}
              /* ── NOT FOUR BUTTONS WITH ONE NAME ───────────────────────────
                 Every swatch carried the identical "Use this colour", so a
                 screen reader announced the row as four indistinguishable
                 controls and the only thing telling them apart was the colour,
                 which is also what a colour-blind reader does not get. */
              aria-label={
                index === inUse
                  ? `Use this colour: ${names[index]}, in use now`
                  : `Use this colour: ${names[index]}`
              }
              aria-current={index === inUse ? true : undefined}
              /* The mark sits OUTSIDE the swatch. A tick drawn on top would need
                 its own contrast ruling against an arbitrary customer colour;
                 an outline on the page behind it needs none. */
              className={
                index === inUse
                  ? 'size-8 rounded-control outline-2 outline-offset-2 outline-ink'
                  : 'surface-ring size-8 rounded-control'
              }
              style={{ background: color }}
            />
          ))}
        </div>
      ) : null}

      {/* ── A LOGO WITH NO COLOUR IN IT ───────────────────────────────────────
          Founder's ruling, 2026-08-30: pick-a-colour. His own logo is grey,
          white and black, so the extractor was right and there was simply
          nothing to offer. Saying that plainly and handing over a picker is the
          honest answer; five grey decoys was not. */}
      {monochrome ? (
        <div className="mt-3">
          <p className="type-xs text-muted">
            Your logo is greys and blacks, so Sahoda found no brand colour in it. Pick one and
            everything follows it.
          </p>
          <label className="surface-ring mt-2 flex items-center justify-between gap-2 rounded-control p-2">
            <span className="type-xs text-ink">Pick your brand colour</span>
            <input
              type="color"
              disabled={busy}
              /* No seed value. `<input type="color">` speaks hex and the design
                 lint forbids a hex literal here, correctly — a token would be
                 the right answer and this element cannot take one. Left
                 unseeded, the browser shows its own default and `onChange`
                 fires only on a real choice, so nothing is saved until the
                 person picks. */
              onChange={(e) => pick(e.target.value)}
              className="size-8 cursor-pointer rounded-control border-0 bg-transparent p-0"
            />
          </label>
        </div>
      ) : null}

      {/* ── THE SWITCH, STATED AS WHAT IT IS ────────────────────────────────────
          Pressing the logo does this too. It is repeated here because a person
          who opened the menu to fix an unreadable screen should not have to
          guess that the way out is the button they just walked past, and because
          this is the only place that can say which state they are in.

          `flex-wrap`: at 280px "Your brand colours are on" beside "Use Sahoda
          colours" does not fit on one line, and without this the two were
          squeezed into a ragged two-line span with the button jammed against it.
          Wrapping puts the button on its own line instead. */}
      {hasTheme ? (
        <div className="surface-ring mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control p-2">
          <span className="type-xs text-ink">
            {skinOn ? 'Your brand colours are on' : 'Sahoda colours are on'}
          </span>
          <Button variant="secondary" disabled={busy} onClick={onToggleSkin}>
            {skinOn ? 'Use Sahoda colours' : 'Use my colours'}
          </Button>
        </div>
      ) : null}

      {/* SAID NEXT TO THE SWITCH IT IS ABOUT. As the last line of the opening
          paragraph it read as "light and dark stay on the moon", which assumes
          the reader already knows the moon is the theme control. It belongs
          beside the one switch a person might mistake for that one. */}
      {hasTheme ? (
        <p className="type-xs mt-1 text-muted">
          The sun and moon in the top bar still switch light and dark.
        </p>
      ) : null}

      {failed ? (
        <p className="type-xs mt-3 text-danger" role="alert">
          {failed}
        </p>
      ) : null}

      {/* A silent conversion is a surprise waiting to happen: somebody who
          uploaded a vector should not have to discover from the media library
          that Sahoda holds a picture of it. */}
      {converted ? (
        <p className="type-xs mt-3 text-muted">
          Sahoda saved your SVG as a high-resolution image, which is what social channels and image
          generation can use.
        </p>
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
        /* SVG included, and it does not reach storage as one: `setBrandLogo`
           rasterises it and discards the vector. Without this line the dialog
           greys out the founder's own logo, which presents as the button doing
           nothing at all. */
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          /**
           * ── THE VALUE IS CLEARED, AND THAT IS THE WHOLE SECOND BUG ────────
           * A file input fires `change` only when its VALUE changes. Choosing
           * the same file twice does not change it, so the second press and
           * every press after it fired NOTHING: no handler, no request, no
           * error, not a single line in the network tab.
           *
           * That is what "still not working" was. The founder was re-choosing
           * the same logo to test, so after the first attempt he was clicking a
           * control that had been inert since the moment he picked that file.
           * The previous commit made the first attempt report its refusal and
           * could not have helped with any attempt after it.
           */
          e.target.value = ''
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
