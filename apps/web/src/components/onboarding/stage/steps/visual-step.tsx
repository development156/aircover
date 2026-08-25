'use client'

import { SWATCH_KEYS, type SwatchKey } from '../store'
import type { StepProps } from './types'

/**
 * 04 — Visual identity. Entirely optional; Continue is never gated here.
 *
 * ── IT ASKED FOR TWO UPLOADS AND KEPT NEITHER FILE ───────────────────────────
 * A logo dropzone and a brand-guidelines dropzone were removed here, and this
 * note is the record of why so neither is reinstated as a nicety.
 *
 * The logo persisted as `f.name`. The bytes were turned into an object URL for
 * the preview, the preview died with the document, and what survived was a
 * string like `logo-final-2.png`. It did not even feed the palette: colour
 * extraction is `app/actions/theme.ts`, which this screen never called, so
 * uploading a teal logo changed nothing about the workspace's colours.
 *
 * The guidelines dropzone kept `{ name, size }` — the same shape, with no bytes
 * — for files a person believed had been read.
 *
 * Both also COUNTED. `signalIds` pushed `logo` and one id per document, so the
 * confidence figure on the result screen and the orb's density both rose for
 * inputs that reached nothing. The number is a claim about how much Sahoda was
 * told, so it was overstated by the act of discarding something.
 *
 * The colours stay, because the colours are real: `use-build.ts` sends the
 * swatches that were moved to `saveWorkspaceTheme`, and falls back to colours
 * pulled off the website when none were moved.
 *
 * ── WHAT IT WOULD TAKE TO BRING THE UPLOADS BACK ─────────────────────────────
 * Real file plumbing: bytes to storage through the assets path, then a logo
 * column or an asset row to point at, then extraction into the palette for the
 * logo and into the knowledge library for the documents. That is a feature, not
 * a dropzone, and it should return as one.
 */
export function VisualStep({ data, patch }: StepProps) {
  function setColor(key: SwatchKey, value: string): void {
    patch({
      colors: { ...data.colors, [key]: value.toUpperCase() },
      // Recorded so the count knows this swatch was MOVED. Without it the three
      // defaults would read as three signals on a workspace that never opened
      // the picker.
      colorsTouched: data.colorsTouched.includes(key)
        ? data.colorsTouched
        : [...data.colorsTouched, key],
    })
  }

  return (
    <>
      <div className="step__head rise">
        <p className="micro step__eyebrow">Visual identity</p>
        <h2 className="display">Let&rsquo;s make sure Sahoda sees your brand the way you do.</h2>
        <p className="lead step__lead">
          Set the colours Sahoda uses for your workspace. Leave them and it reads the colours off
          your website instead.
        </p>
      </div>
      <div className="rise">
        <p className="label" style={{ margin: '0 0 12px' }}>
          Brand colours
        </p>
        <div className="swatches" id="swatches">
          {SWATCH_KEYS.map((k) => (
            <div className="sw" key={k}>
              <div className="sw__dot" style={{ background: data.colors[k] }} />
              <input
                className="sw__in"
                type="color"
                value={data.colors[k]}
                onChange={(e) => setColor(k, e.target.value)}
                aria-label={`${k} colour`}
              />
              <div className="sw__l">{k}</div>
              <div className="sw__v">{data.colors[k]}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
