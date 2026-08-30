'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  commit,
  objectAt,
  removeObject,
  replaceObject,
  toPicturePoint,
  translateObject,
  type DrawObject,
  type DrawState,
  type DrawTool,
  type Point,
} from '@/lib/studio/draw-objects'
import { redraw, type Ink } from '@/lib/studio/draw-render'

/**
 * THE SURFACE SOMEBODY DRAWS ON.
 *
 * ── TWO STACKED CANVASES, AND ONLY ONE OF THEM TAKES INPUT ──────────────────
 * The photograph is on the lower canvas and never redrawn. The marks are on the
 * upper one, which carries every pointer handler and is cleared and replayed
 * from the object list on every change. That is what makes the eraser safe by
 * construction rather than by care: it cannot reach the photograph, because
 * nothing ever draws a mark onto the photograph's canvas.
 *
 * ── ONE POINTER PATH, NOT A MOUSE PATH AND A TOUCH PATH ─────────────────────
 * Pointer events cover a mouse, a finger and a stylus with one set of handlers.
 * Half this product's users are shop owners holding a phone, so a drawing tool
 * bound to mouse events is a drawing tool half of them cannot use, and two
 * parallel implementations are two places for the behaviour to diverge.
 *
 * ── AND THE INK COLOURS COME FROM TOKENS ────────────────────────────────────
 * Read once from `--photo-ink` and `--photo-ink-edge` off the document, then
 * passed into the pure renderer. A colour anywhere in this product is a token,
 * including one that lands on a canvas.
 */
export function DrawCanvas({
  background,
  size,
  tool,
  brush,
  state,
  onChange,
}: {
  /** The loaded photograph. Null until it decodes. */
  background: CanvasImageSource | null
  size: { width: number; height: number }
  tool: DrawTool
  brush: number
  state: DrawState
  onChange: (next: DrawState) => void
}) {
  const photo = useRef<HTMLCanvasElement>(null)
  const ink = useRef<HTMLCanvasElement>(null)
  const [colours, setColours] = useState<Ink>({ fill: 'transparent', edge: 'transparent' })

  /** A drag in flight. Held in a ref so a move does not re-render per frame. */
  const drag = useRef<
    | { kind: 'draw'; object: DrawObject }
    // The ORIGINAL is kept, and every frame offsets from it. Offsetting the
    // current object instead accumulates rounding and the shape drifts away
    // from the finger over a long drag.
    | { kind: 'move'; original: DrawObject; from: Point }
    | null
  >(null)
  const [live, setLive] = useState<DrawObject | null>(null)

  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    setColours({
      fill: style.getPropertyValue('--photo-ink').trim(),
      edge: style.getPropertyValue('--photo-ink-edge').trim(),
    })
  }, [])

  // The photograph, drawn once per picture and never again.
  useEffect(() => {
    const canvas = photo.current
    if (canvas === null || background === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.drawImage(background, 0, 0, size.width, size.height)
  }, [background, size.width, size.height])

  // The marks, replayed in full on every change. See `redraw`'s header for why
  // a full replay rather than an incremental one.
  useEffect(() => {
    const canvas = ink.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    redraw(ctx, size, state.objects, colours, live)
  }, [state.objects, live, size, colours])

  const pointOf = useCallback(
    (event: React.PointerEvent): Point => {
      const canvas = ink.current
      if (canvas === null) return { x: 0, y: 0 }
      return toPicturePoint({
        clientX: event.clientX,
        clientY: event.clientY,
        rect: canvas.getBoundingClientRect(),
        picture: size,
      })
    },
    [size],
  )

  function down(event: React.PointerEvent) {
    // Captured so a drag that leaves the canvas still ends properly. Without
    // this, letting go outside the picture leaves a stroke stuck to the finger.
    event.currentTarget.setPointerCapture(event.pointerId)
    const at = pointOf(event)

    if (tool === 'eraser') {
      const hit = objectAt(state.objects, at)
      // Erases a MARK, never pixels. Nothing to erase is not a failure and says
      // nothing: a person sweeping an empty corner has not done anything wrong.
      if (hit !== null) onChange(commit(state, removeObject(state.objects, hit.id)))
      return
    }

    if (tool === 'pointer') {
      const hit = objectAt(state.objects, at)
      if (hit !== null) drag.current = { kind: 'move', original: hit, from: at }
      return
    }

    if (tool === 'text') return

    const id = crypto.randomUUID()
    const object: DrawObject =
      tool === 'pencil'
        ? { kind: 'stroke', id, points: [at], width: brush }
        : tool === 'rect'
          ? { kind: 'rect', id, from: at, to: at, width: brush }
          : { kind: 'arrow', id, from: at, to: at, width: brush }

    drag.current = { kind: 'draw', object }
    setLive(object)
  }

  function move(event: React.PointerEvent) {
    const current = drag.current
    if (current === null) return
    const at = pointOf(event)

    if (current.kind === 'move') {
      const moved = translateObject(current.original, at.x - current.from.x, at.y - current.from.y)
      // Not committed per frame: one drag is one undo step, so pressing undo
      // once puts the shape back where it started rather than one frame back.
      setLive(moved)
      return
    }

    const object = current.object
    // Switched rather than spread with a `to`: text is a DrawObject and has no
    // `to`, and the compiler is right to refuse. Text is never dragged, but the
    // type has to say so rather than the comment.
    const next: DrawObject =
      object.kind === 'stroke'
        ? { ...object, points: [...object.points, at] }
        : object.kind === 'rect' || object.kind === 'arrow'
          ? { ...object, to: at }
          : object
    drag.current = { kind: 'draw', object: next }
    setLive(next)
  }

  function up() {
    const current = drag.current
    drag.current = null
    if (current === null) return

    if (current.kind === 'move') {
      const moved = live
      setLive(null)
      if (moved !== null) onChange(commit(state, replaceObject(state.objects, moved)))
      return
    }

    const object = current.object
    setLive(null)
    // A tap with the pencil is a single point and draws nothing. Committing it
    // would put an invisible object in the list that undo appears to skip.
    if (object.kind === 'stroke' && object.points.length < 2) return
    onChange(commit(state, [...state.objects, object]))
  }

  return (
    <div
      className="surface-ring relative w-full overflow-hidden rounded-card bg-s2"
      style={{ aspectRatio: `${size.width} / ${size.height}` }}
    >
      <canvas
        ref={photo}
        width={size.width}
        height={size.height}
        // Inert: it holds the photograph and must never take a pointer, which is
        // half of why a mark cannot land on it.
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden
      />
      <canvas
        ref={ink}
        width={size.width}
        height={size.height}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        // `touch-none` so a finger draws instead of scrolling the page. Without
        // it the picture scrolls away under the stroke.
        className="absolute inset-0 size-full touch-none"
        role="img"
        aria-label="Your picture, with anything you have drawn on it"
        data-guide="studio-draw-canvas"
      />
    </div>
  )
}
