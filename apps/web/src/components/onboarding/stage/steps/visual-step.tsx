'use client'

import { FileText, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'

import { DropZone } from '../drop-zone'
import { fmtSize } from '../refs'
import { SWATCH_KEYS, type SwatchKey } from '../store'
import type { StepProps } from './types'

/**
 * 04 — Visual identity. Entirely optional; Continue is never gated here.
 *
 * The logo preview is an object URL, which is a handle into THIS document and
 * dies with it. Only the file NAME is persisted, so a resumed session shows the
 * name it was given rather than a broken image element pointing at a revoked
 * blob — the browser renders that as the alt text with a torn-page icon, which
 * reads as "your upload failed" about an upload that succeeded.
 */
export function VisualStep({ data, patch }: StepProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Revoked on unmount and on replacement: an object URL pins its blob in
  // memory for the lifetime of the document until it is released.
  useEffect(() => {
    return () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl)
    }
  }, [logoUrl])

  function takeLogo(files: FileList): void {
    const f = files[0]
    if (!f || !f.type.startsWith('image/')) return
    setLogoUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(f)
    })
    patch({ logo: f.name })
  }

  function takeDocs(files: FileList): void {
    patch({
      docs: [...data.docs, ...[...files].map((f) => ({ name: f.name, size: f.size }))],
    })
  }

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
      </div>
      <div className="rise">
        <DropZone
          id="logo-drop"
          label="Upload your logo"
          detail="PNG · SVG · JPG"
          accept="image/*"
          icon={<Upload className="drop__ic" size={24} strokeWidth={1.6} aria-hidden />}
          onFiles={takeLogo}
        >
          {data.logo ? (
            <>
              {logoUrl ? <img src={logoUrl} alt={data.logo} /> : null}
              <span className="drop__t" style={{ marginTop: 8 }}>
                {data.logo}
              </span>
              <span className="drop__d">Click to replace</span>
            </>
          ) : null}
        </DropZone>

        <p className="label" style={{ margin: '26px 0 12px' }}>
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

        <DropZone
          id="doc-drop"
          label="Upload brand guidelines"
          detail="Optional · PDF · PPT · DOCX · ZIP · Images"
          multiple
          style={{ marginTop: 26, padding: 20 }}
          icon={<FileText className="drop__ic" size={24} strokeWidth={1.6} aria-hidden />}
          onFiles={takeDocs}
        />
        <div className="filelist" id="filelist">
          {data.docs.map((doc, i) => (
            <div
              className="filerow"
              key={`${doc.name}-${i}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <FileText size={16} strokeWidth={1.6} aria-hidden />
              <b>{doc.name}</b>
              <span>{fmtSize(doc.size)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
