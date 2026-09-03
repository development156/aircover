'use client'

import { useRef, useState } from 'react'

import { extractPalette } from '@/lib/brand/color-extract'
import { LOGO_FILE_ACCEPT } from '@/lib/brand/logo-accept'
import type { StepProps } from './types'

/**
 * 04 — Visual identity. Entirely optional; Continue is never gated here.
 *
 * ── THE LOGO IS BACK, AS A FEATURE THIS TIME ────────────────────────────────
 * A logo dropzone was removed from this screen once, and the note left behind
 * said exactly what bringing it back would take: "Real file plumbing: bytes to
 * storage through the assets path, then a logo column or an asset row to point
 * at, then extraction into the palette. That is a feature, not a dropzone, and
 * it should return as one."
 *
 * That is what this is. The bytes go to the assets library through
 * `uploadAsset` at build time, so the file is KEPT and appears in Assets like
 * anything else; the colours are read here and become the workspace theme. The
 * old version persisted `f.name`, uploaded nothing, and fed no palette, so a
 * teal logo changed nothing about the workspace.
 *
 * ── AND THE COLOUR PICKERS ARE GONE ─────────────────────────────────────────
 * Founder's ruling, 2026-08-29. Three hex fields asked a shop owner to do our
 * work, and one of the three could not be honoured at all: Brand Skin themes
 * seven tokens and the surface is not among them. They know their logo.
 *
 * ── EXTRACTION RUNS HERE, IN THE BROWSER, ON PURPOSE ────────────────────────
 * `extractPalette` needs a decoded image and a canvas. Doing it on the client
 * means the person sees the colours Sahoda found before they continue, which is
 * the only way to catch "that is not my brand at all" while it is still cheap.
 * It also means an unreadable file costs no upload: nothing is sent until the
 * build, and a file that yields no colours is reported here rather than saved as
 * a theme of nothing.
 */
export function VisualStep({ data, patch, onLogo }: StepProps & { onLogo?: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const [reading, setReading] = useState(false)

  async function take(file: File): Promise<void> {
    setReading(true)
    setUnreadable(false)
    const url = URL.createObjectURL(file)
    try {
      const img = await load(url)
      const palette = extractPalette(img)
      if (palette.length === 0) {
        // A file we opened and could read nothing from. NOT the same sentence as
        // a file that would not open, and not a silent default either.
        setUnreadable(true)
        patch({ palette: [], logoName: '' })
        return
      }
      setPreview(url)
      patch({ palette, logoName: file.name })
      onLogo?.(file)
    } catch {
      setUnreadable(true)
      patch({ palette: [], logoName: '' })
    } finally {
      setReading(false)
    }
  }

  const has = data.palette.length > 0

  return (
    <>
      <div className="step__head rise">
        <p className="micro step__eyebrow">Visual identity</p>
        <h2 className="display">Add your logo and Sahoda takes its colours from it.</h2>
        <p className="lead step__lead">
          Everything Sahoda designs for you then matches your brand instead of ours. Skip this and
          it reads the colours off your website instead.
        </p>
      </div>

      <div className="rise">
        <input
          ref={input}
          type="file"
          /* SVG included. It reaches `setBrandLogo`, which rasterises it and
             discards the vector, so nothing stored is ever an SVG. See
             `lib/brand/logo-accept.ts` for why this list lives in one place. */
          accept={LOGO_FILE_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void take(file)
          }}
        />

        <button type="button" className="btn btn--ghost" onClick={() => input.current?.click()}>
          {reading
            ? 'Reading your logo…'
            : has || data.logoName
              ? 'Choose a different logo'
              : 'Choose your logo'}
        </button>

        {has ? (
          <div style={{ marginTop: 16 }}>
            <p className="label" style={{ margin: '0 0 12px' }}>
              {/* The FILE NAME, because a resumed tab has the colours and not the
                  picture, and "your logo" beside no preview would be a claim
                  about something that is no longer here. */}
              Colours from {data.logoName || 'your logo'}
            </p>
            <div className="swatches" id="swatches">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt={`Your logo, ${data.logoName}`}
                  style={{ height: 40, width: 'auto', objectFit: 'contain' }}
                />
              ) : null}
              {data.palette.map((color) => (
                <span
                  key={color}
                  className="bb__sw"
                  style={{ background: color }}
                  aria-label={color}
                />
              ))}
            </div>
          </div>
        ) : null}

        {unreadable ? (
          <p className="lead" style={{ marginTop: 12 }}>
            Sahoda opened that and could not find a colour in it. A logo that is mostly white or
            mostly black reads this way. Try another file, or skip this and Sahoda reads your
            website instead.
          </p>
        ) : null}
      </div>
    </>
  )
}

/** Decoded, because `extractPalette` needs real pixels rather than a promise of them. */
function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'))
    img.src = url
  })
}
