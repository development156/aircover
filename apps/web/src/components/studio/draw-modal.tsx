'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  ArrowUpRight,
  Eraser,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
} from 'lucide-react'

import { uploadAsset } from '@/app/actions/assets'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  canRedo,
  canUndo,
  commit,
  emptyDrawing,
  redo,
  undo,
  type DrawState,
  type DrawTool,
} from '@/lib/studio/draw-objects'
import { composite, type Ink } from '@/lib/studio/draw-render'

import { DrawCanvas } from './draw-canvas'

/**
 * DRAW ON A PICTURE, AND HAND THE RESULT TO THE MODEL.
 *
 * ── WHY DRAWING BEATS DESCRIBING ────────────────────────────────────────────
 * "Remove the thing on the left" is a sentence a model has to interpret. A
 * circle around the thing is not. This is the difference between a picture
 * somebody has to re-roll four times and one that comes back right, and it costs
 * credits every time it does not.
 *
 * ── THE RESULT IS A PICTURE, NOT A MASK ─────────────────────────────────────
 * What the image call takes today is an image reference. So the layers are
 * flattened into one opaque picture, uploaded to this workspace's own library
 * like any other, and handed back as a reference id. It travels the same signed
 * path as every other reference, which means no new way for bytes to reach a
 * provider.
 *
 * ── ON THE NATIVE DIALOG, DELIBERATELY ──────────────────────────────────────
 * `ui/modal.tsx` uses `<dialog showModal()>`, whose top layer cannot be captured
 * by a `backdrop-filter` ancestor. A hand-rolled overlay here would be one more
 * instance of the trap documented in apps/web/CLAUDE.md.
 */

const TOOLS: { tool: DrawTool; label: string; Icon: typeof Pencil }[] = [
  { tool: 'pointer', label: 'Move something you drew', Icon: MousePointer2 },
  { tool: 'pencil', label: 'Draw freely', Icon: Pencil },
  { tool: 'rect', label: 'Draw a box', Icon: Square },
  { tool: 'arrow', label: 'Point at something', Icon: ArrowUpRight },
  { tool: 'text', label: 'Write a word', Icon: Type },
  { tool: 'eraser', label: 'Take a mark back', Icon: Eraser },
]

export function DrawModal({
  open,
  onClose,
  picture,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** The picture being drawn on, with a signed link and its real size. */
  picture: { url: string; width: number; height: number; prompt: string } | null
  /** Called with the new asset's id once the flattened picture is stored. */
  onSaved: (assetId: string) => void
}) {
  const [tool, setTool] = useState<DrawTool>('pencil')
  const [state, setState] = useState<DrawState>(emptyDrawing)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const inkColours = useRef<Ink>({ fill: 'transparent', edge: 'transparent' })

  const size =
    picture === null ? { width: 1, height: 1 } : { width: picture.width, height: picture.height }

  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    inkColours.current = {
      fill: style.getPropertyValue('--photo-ink').trim(),
      edge: style.getPropertyValue('--photo-ink-edge').trim(),
    }
  }, [])

  /**
   * ── `crossOrigin` IS LOAD-BEARING ─────────────────────────────────────────
   * Without it the storage host's picture TAINTS the canvas, and `toBlob` throws
   * a security error at the moment somebody presses Save. Everything before that
   * looks perfect, which is the worst place for this to fail.
   */
  useEffect(() => {
    if (picture === null) {
      setImage(null)
      return
    }
    setState(emptyDrawing())
    setNote(null)

    let live = true
    const element = new Image()
    element.crossOrigin = 'anonymous'
    element.onload = () => {
      if (live) setImage(element)
    }
    element.onerror = () => {
      if (live) setNote('Sahoda could not open that picture to draw on. Close this and try again.')
    }
    element.src = picture.url
    return () => {
      live = false
    }
  }, [picture])

  function save() {
    if (picture === null || image === null) return
    setNote(null)

    start(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const ctx = canvas.getContext('2d')
      if (ctx === null) {
        setNote('This browser could not flatten the picture. Nothing was changed or charged.')
        return
      }

      composite(ctx, image, size, state.objects, inkColours.current)

      const blob = await new Promise<Blob | null>((resolve) =>
        // PNG, not JPEG: a drawn line has hard edges and JPEG smears them, and
        // the model is being asked to look closely at exactly those edges.
        canvas.toBlob((one) => resolve(one), 'image/png'),
      )
      if (blob === null) {
        setNote('This browser could not flatten the picture. Nothing was changed or charged.')
        return
      }

      const body = new FormData()
      body.set('file', new File([blob], 'drawn.png', { type: 'image/png' }))
      const result = await uploadAsset(body)
      if (!result.ok) {
        setNote(result.message)
        return
      }
      onSaved(result.asset.id)
      onClose()
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Draw on this picture"
      description="Circle what you want changed, or point at it. Sahoda sends the marked picture to the model, which is far more exact than describing it in words."
      className="w-[min(96vw,900px)]"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" data-guide="studio-draw-tools">
          {TOOLS.map(({ tool: one, label, Icon }) => (
            <button
              key={one}
              type="button"
              onClick={() => setTool(one)}
              aria-pressed={tool === one}
              aria-label={label}
              title={label}
              className={`surface-ring flex size-[44px] items-center justify-center rounded-card transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                tool === one ? 'bg-primary text-primary-foreground' : 'bg-s2 text-muted'
              }`}
            >
              <Icon className="size-[18px]" aria-hidden />
            </button>
          ))}

          <span className="mx-1 h-[24px] w-px bg-line" aria-hidden />

          <button
            type="button"
            onClick={() => setState(undo(state))}
            aria-label="Undo the last mark"
            title="Undo the last mark"
            aria-disabled={!canUndo(state)}
            className={`surface-ring flex size-[44px] items-center justify-center rounded-card bg-s2 text-muted transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              canUndo(state) ? '' : 'opacity-50'
            }`}
          >
            <Undo2 className="size-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setState(redo(state))}
            aria-label="Put back the mark you undid"
            title="Put back the mark you undid"
            aria-disabled={!canRedo(state)}
            className={`surface-ring flex size-[44px] items-center justify-center rounded-card bg-s2 text-muted transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              canRedo(state) ? '' : 'opacity-50'
            }`}
          >
            <Redo2 className="size-[18px]" aria-hidden />
          </button>
        </div>

        {tool === 'text' ? (
          <TextRow
            onAdd={(text) => {
              setState(
                commit(state, [
                  ...state.objects,
                  {
                    kind: 'text',
                    id: crypto.randomUUID(),
                    // Placed at a readable spot rather than at a click, so a word
                    // can be added without a second gesture to learn. It can then
                    // be moved with the pointer tool like anything else.
                    at: { x: size.width * 0.1, y: size.height * 0.85 },
                    text,
                    size: Math.max(24, Math.round(size.width / 18)),
                  },
                ]),
              )
              setTool('pointer')
            }}
          />
        ) : null}

        {picture === null ? null : (
          <DrawCanvas
            background={image}
            size={size}
            tool={tool}
            brush={Math.max(4, Math.round(size.width / 200))}
            state={state}
            onChange={setState}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} loading={busy} disabled={image === null}>
            Use this marked picture
          </Button>
          <span className="type-sm text-muted">
            It is saved to your library as a new picture. The one you drew on is untouched.
          </span>
        </div>

        {note === null ? null : (
          <p role="alert" className="type-sm text-ink">
            {note}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** One word to put on the picture. Its own row, because it needs a text field. */
function TextRow({ onAdd }: { onAdd: (text: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="type-sm text-muted">What should it say?</span>
        <input
          value={value}
          maxLength={40}
          onChange={(event) => setValue(event.target.value)}
          className="surface-ring h-input rounded-sm bg-surface px-2 type-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </label>
      <Button
        onClick={() => {
          if (value.trim() === '') return
          onAdd(value.trim())
          setValue('')
        }}
        disabled={value.trim() === ''}
      >
        Put it on the picture
      </Button>
    </div>
  )
}
