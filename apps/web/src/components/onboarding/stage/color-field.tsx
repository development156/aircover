'use client'

import { Check, Pipette } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { isLight, parseHex, SWATCH_ROWS } from './palette'

/**
 * One brand colour: a swatch that opens a picker with a grid, a hex field and
 * an eyedropper.
 *
 * ── WHAT THIS REPLACED, AND WHY ──────────────────────────────────────────────
 * A bare `<input type="color">` covering the swatch. It opened the operating
 * system's colour dialog — a different dialog on every machine, none of them
 * ours — and it had NO WAY TO TYPE A HEX. A business that knows its brand
 * colour is `#0068D6` had to hunt for it in a gradient square, which is the one
 * task a gradient square is worst at.
 *
 * The founder reported both, in those words, on 25 August.
 *
 * ── THE NATIVE INPUT IS STILL HERE, AS THE LAST RESORT ───────────────────────
 * Kept behind "Full spectrum", because removing it removes a real capability:
 * somebody whose colour is not in the grid, who does not know its hex, and who
 * has nothing on screen to sample needs a gradient. It is the escape hatch and
 * no longer the whole interface.
 *
 * ── THE EYEDROPPER IS FEATURE-DETECTED, NOT ASSUMED ──────────────────────────
 * `EyeDropper` is Chromium-only. A button that opens nothing on Safari and
 * Firefox is a remedy that cannot work, which this codebase has a spec named
 * after. It renders only where it functions.
 */

interface EyeDropperCtor {
  new (): { open(): Promise<{ sRGBHex: string }> }
}

export interface ColorFieldProps {
  label: string
  value: string
  onChange: (hex: string) => void
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [dropper, setDropper] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  const hexId = useId()

  // Detected on mount rather than at module scope: this file is also imported
  // on the server, where `window` does not exist.
  useEffect(() => {
    setDropper(typeof window !== 'undefined' && 'EyeDropper' in window)
  }, [])

  // The field follows the value while closed, so reopening never shows a stale
  // draft from a picker somebody abandoned.
  useEffect(() => {
    if (!open) setDraft(value)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent): void {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /** Committed on every keystroke that parses, so a paste lands without an Enter. */
  function typeHex(next: string): void {
    setDraft(next)
    const parsed = parseHex(next)
    if (parsed) onChange(parsed)
  }

  async function sample(): Promise<void> {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper
    if (!Ctor) return
    try {
      const picked = await new Ctor().open()
      const parsed = parseHex(picked.sRGBHex)
      if (parsed) {
        onChange(parsed)
        setDraft(parsed)
      }
    } catch {
      // The person pressed Escape. Not an error, and nothing to tell them.
    }
  }

  return (
    <div className="cf" ref={wrap}>
      <button
        type="button"
        className="cf__dot"
        style={{ background: value }}
        aria-label={`${label} colour, ${value}. Choose a colour`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      <div className="cf__l">{label}</div>
      <div className="cf__v tnum">{value}</div>

      {open ? (
        <div className="cpick" role="dialog" aria-label={`${label} colour`}>
          <div className="cpick__grid">
            {SWATCH_ROWS.map((row, r) => (
              <div className="cpick__row" key={r}>
                {row.map((swatch) => {
                  const selected = swatch === value
                  return (
                    <button
                      key={swatch}
                      type="button"
                      className={`cpick__sw ${selected ? 'on' : ''}`}
                      style={{ background: swatch }}
                      aria-label={swatch}
                      aria-pressed={selected}
                      onClick={() => {
                        onChange(swatch)
                        setDraft(swatch)
                      }}
                    >
                      {selected ? (
                        <Check
                          size={12}
                          strokeWidth={3.2}
                          aria-hidden
                          className={isLight(swatch) ? 'cpick__tick--dark' : ''}
                        />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="cpick__foot">
            <span className="cpick__prev" style={{ background: value }} aria-hidden />
            <label className="cpick__hexwrap" htmlFor={hexId}>
              <span className="cpick__hash" aria-hidden>
                #
              </span>
              <input
                id={hexId}
                className="cpick__hex tnum"
                value={draft.replace(/^#/, '')}
                onChange={(e) => typeHex(e.target.value)}
                onKeyDown={(e) => {
                  // The stage advances on Enter, and half a hex is not an answer.
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    setOpen(false)
                  }
                }}
                placeholder="0068D6"
                spellCheck={false}
                autoComplete="off"
                aria-label={`${label} hex code`}
              />
            </label>
            {dropper ? (
              <button
                type="button"
                className="cpick__tool"
                onClick={() => void sample()}
                aria-label="Pick a colour from the screen"
                title="Pick a colour from the screen"
              >
                <Pipette size={14} strokeWidth={1.9} aria-hidden />
              </button>
            ) : null}
          </div>

          <label className="cpick__native">
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              aria-label={`${label}, full spectrum`}
            />
            Full spectrum
          </label>
        </div>
      ) : null}
    </div>
  )
}
