'use client'

import { useId, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface LogoValue {
  dataUrl: string
  fileName: string
}

export interface LogoDropProps {
  value: LogoValue | null
  onChange: (logo: LogoValue | null) => void
  guide?: string
  className?: string
}

/** Reads a File client-side as a data URL — never uploaded anywhere. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

// Optional logo upload used in both Spark (step 1) and Theme (step 4, as the
// empty-state recovery if it was skipped). All states shipped: empty / hover /
// focus-visible / has-value / error (unsupported file) / disabled.
export function LogoDrop({ value, onChange, guide, className }: LogoDropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file (PNG, JPG or SVG).')
      return
    }
    try {
      const dataUrl = await readAsDataUrl(file)
      setError(null)
      onChange({ dataUrl, fileName: file.name })
    } catch {
      setError('Could not read that file — try another one.')
    }
  }

  function clear() {
    onChange(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-[12.5px] font-semibold text-ink">
        Logo <span className="font-normal text-muted">(optional)</span>
      </label>

      {value ? (
        <div className="flex items-center gap-3 rounded-input border border-line bg-s1 p-2.5">
          {/* Data URL, not a remote src — a plain <img> is correct here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.dataUrl}
            alt=""
            className="size-10 shrink-0 rounded-[8px] border border-line bg-bg object-contain"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
            {value.fileName}
          </span>
          <button
            type="button"
            onClick={clear}
            aria-label="Remove logo"
            className="grid size-7 shrink-0 place-items-center rounded-pill text-muted transition-micro hover:bg-s2 hover:text-ink"
          >
            <X size={15} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-guide={guide}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2.5 rounded-input border border-dashed border-line bg-s1 px-3 py-2.5 text-left text-[13.5px] font-medium text-muted transition-micro hover:border-faint hover:bg-s2 hover:text-ink"
        >
          <ImagePlus size={18} strokeWidth={1.7} className="shrink-0 text-faint" aria-hidden />
          Upload your logo
        </button>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => handleFiles(event.target.files)}
      />
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  )
}
