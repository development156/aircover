'use client'

import { useRef, useState, type ReactNode } from 'react'

export interface DropZoneProps {
  id: string
  label: string
  detail: string
  accept?: string
  multiple?: boolean
  icon: ReactNode
  onFiles: (files: FileList) => void
  /** Replaces the label/detail once something has been dropped. */
  children?: ReactNode
  style?: React.CSSProperties
}

/**
 * A drag-and-drop file zone that is also a real button.
 *
 * The source binds click, Enter and Space, and `dragenter/dragover/dragleave/
 * drop`. All four drag events call `preventDefault()`: without it on
 * `dragover` the browser refuses the drop, and without it on `drop` the browser
 * NAVIGATES AWAY to the dropped file — which on this screen would throw away
 * every answer given so far.
 *
 * `role="button"` plus `tabIndex` rather than a real <button> because a button
 * cannot legally contain the preview <img> layout the source renders after a
 * drop, and because the file input must stay a sibling it can click.
 */
export function DropZone({
  id,
  label,
  detail,
  accept,
  multiple,
  icon,
  onFiles,
  children,
  style,
}: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function open(): void {
    input.current?.click()
  }

  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      id={id}
      tabIndex={0}
      role="button"
      aria-label={label}
      style={style}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files)
      }}
    >
      {children ?? (
        <>
          {icon}
          <span className="drop__t">{label}</span>
          <span className="drop__d">{detail}</span>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files)
          // Cleared so re-picking the SAME file fires `change` again. Without
          // this, dropping a logo, removing it and re-picking it does nothing.
          e.target.value = ''
        }}
      />
    </div>
  )
}
