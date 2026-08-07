'use client'

import { useState } from 'react'

import { ARTIFACT_MIME_TYPES } from '@/lib/ops/qa-draft'
import { cn } from '@/lib/utils'

/**
 * Screenshots on a manual QA run (doc 13 §11).
 *
 * Presentational: it renders what it is given and reports files upward. The
 * check-sign-upload-record sequence lives in `lib/ops/qa-upload.ts` where it can
 * be tested without a browser.
 *
 * Paste is deliberately NOT handled here. `⌘V` belongs to whatever has focus,
 * which is usually the notes field, so the composer owns the paste handler on
 * its root and hands the files down — otherwise a paste only works when this
 * box happens to be focused, which is not what anyone means by "paste a
 * screenshot".
 */

export type ThumbState = 'uploading' | 'stored' | 'failed'

export interface QaThumb {
  key: string
  url: string | null
  caption: string | null
  state: ThumbState
  message?: string
}

interface QaScreenshotsProps {
  items: readonly QaThumb[]
  /** Why attaching is unavailable, or null when it is available. */
  blockedReason: string | null
  error: string | null
  onFiles: (files: readonly File[]) => void
}

const ACCEPT = ARTIFACT_MIME_TYPES.join(',')

export function QaScreenshots({ items, blockedReason, error, onFiles }: QaScreenshotsProps) {
  const [over, setOver] = useState(false)
  const disabled = blockedReason !== null

  function take(list: FileList | null) {
    if (disabled || !list || list.length === 0) return
    onFiles(Array.from(list))
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          if (disabled) return
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          take(event.dataTransfer.files)
        }}
        className={cn(
          'rounded-card border border-dashed p-4 text-center transition-micro',
          over ? 'border-accent bg-s1' : 'border-line',
          disabled && 'opacity-45',
        )}
      >
        <p className="text-[13px] text-muted">
          Drop a screenshot here, paste one anywhere in this form, or{' '}
          <label className="cursor-pointer font-semibold text-accent underline underline-offset-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            choose a file
            <input
              type="file"
              accept={ACCEPT}
              multiple
              disabled={disabled}
              className="sr-only"
              onChange={(event) => {
                take(event.target.files)
                // Same file twice in a row must still fire onChange.
                event.target.value = ''
              }}
            />
          </label>
          .
        </p>
        <p className="mt-1 text-[12px] text-muted">PNG, JPEG or WebP · up to 10 MB each</p>
        {/* Absent when available, stated when not — never a live-looking control
            that silently refuses. */}
        {blockedReason ? <p className="mt-2 text-[12px] text-warn">{blockedReason}</p> : null}
      </div>

      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Attached screenshots">
          {items.map((item) => (
            <li
              key={item.key}
              className={cn(
                'relative h-20 w-28 overflow-hidden rounded-input border bg-s1',
                item.state === 'failed' ? 'border-danger' : 'border-line',
              )}
            >
              {item.url ? (
                // Storage-signed URL or a local object URL; next/image would
                // need both hosts allowlisted to show a thumbnail that lives
                // ten minutes.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.caption ?? 'Screenshot attached to this run'}
                  className={cn(
                    'h-full w-full object-cover',
                    item.state === 'uploading' && 'opacity-50',
                  )}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[11px] text-muted">
                  no preview
                </span>
              )}

              {item.state !== 'stored' ? (
                <span
                  className={cn(
                    'absolute inset-x-0 bottom-0 px-1 py-[2px] text-center text-[10px] font-semibold',
                    item.state === 'failed' ? 'bg-danger-bg text-danger' : 'bg-s2 text-muted',
                  )}
                >
                  {item.state === 'uploading' ? 'Uploading…' : (item.message ?? 'Not attached')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
