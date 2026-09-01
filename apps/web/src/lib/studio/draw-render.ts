import type { DrawObject } from './draw-objects'

/**
 * REPLAYING THE MARKS ONTO A CANVAS, AND FLATTENING THE RESULT.
 *
 * ── TWO LAYERS, AND THE PHOTOGRAPH IS THE UNTOUCHED ONE ─────────────────────
 * The picture is drawn on one canvas and the marks on another above it. Nothing
 * in this file ever draws a mark onto the picture's canvas, which is what makes
 * the eraser safe by construction: erasing clears the ink layer and redraws it
 * from the object list, and the photograph underneath was never modified, so it
 * cannot be damaged by an eraser however large the brush.
 *
 * ── AND THE FLATTENED COPY IS A PICTURE, NOT A MASK ─────────────────────────
 * What the model can take today is an image reference, not an alpha mask. So the
 * export composites: the photograph first, then the marks over it, into one
 * opaque picture that says "make it look like this". Order is load-bearing and
 * asserted, because compositing the ink first and the photograph second silently
 * produces the original picture with nothing drawn on it.
 */

/**
 * The two colours every mark is drawn in, read from `--photo-ink` and
 * `--photo-ink-edge` by the component and passed in here.
 *
 * Passed rather than imported so this module stays pure and testable without a
 * document, and so the colours stay TOKENS: a value anywhere in this product is
 * a token, including one that lands on a canvas.
 */
export type Ink = { fill: string; edge: string }

export type RenderTarget = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'strokeRect'
  | 'fillText'
  | 'strokeText'
  | 'save'
  | 'restore'
  | 'drawImage'
> & {
  strokeStyle: string | CanvasGradient | CanvasPattern
  fillStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  font: string
}

/** Draw one object. Never clears, so it composes with everything before it. */
export function drawOne(ctx: RenderTarget, object: DrawObject, ink: Ink): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (object.kind) {
    case 'stroke': {
      // Twice: a dark edge first, the light ink over it. One colour cannot be
      // seen on both a night sky and a white wall, and a person drawing on their
      // own photograph gets whichever they happen to have.
      for (const [colour, width] of [
        [ink.edge, object.width + 4],
        [ink.fill, object.width],
      ] as const) {
        ctx.strokeStyle = colour
        ctx.lineWidth = width
        ctx.beginPath()
        object.points.forEach((point, i) => {
          if (i === 0) ctx.moveTo(point.x, point.y)
          else ctx.lineTo(point.x, point.y)
        })
        ctx.stroke()
      }
      break
    }

    case 'rect': {
      const x = Math.min(object.from.x, object.to.x)
      const y = Math.min(object.from.y, object.to.y)
      const w = Math.abs(object.to.x - object.from.x)
      const h = Math.abs(object.to.y - object.from.y)
      for (const [colour, width] of [
        [ink.edge, object.width + 4],
        [ink.fill, object.width],
      ] as const) {
        ctx.strokeStyle = colour
        ctx.lineWidth = width
        ctx.strokeRect(x, y, w, h)
      }
      break
    }

    case 'arrow': {
      const angle = Math.atan2(object.to.y - object.from.y, object.to.x - object.from.x)
      const head = Math.max(12, object.width * 4)
      for (const [colour, width] of [
        [ink.edge, object.width + 4],
        [ink.fill, object.width],
      ] as const) {
        ctx.strokeStyle = colour
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(object.from.x, object.from.y)
        ctx.lineTo(object.to.x, object.to.y)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(object.to.x, object.to.y)
        ctx.lineTo(
          object.to.x - head * Math.cos(angle - Math.PI / 6),
          object.to.y - head * Math.sin(angle - Math.PI / 6),
        )
        ctx.moveTo(object.to.x, object.to.y)
        ctx.lineTo(
          object.to.x - head * Math.cos(angle + Math.PI / 6),
          object.to.y - head * Math.sin(angle + Math.PI / 6),
        )
        ctx.stroke()
      }
      break
    }

    case 'text': {
      ctx.font = `600 ${object.size}px system-ui, sans-serif`
      ctx.strokeStyle = ink.edge
      ctx.lineWidth = Math.max(3, object.size / 8)
      ctx.strokeText(object.text, object.at.x, object.at.y)
      ctx.fillStyle = ink.fill
      ctx.fillText(object.text, object.at.x, object.at.y)
      break
    }
  }

  ctx.restore()
}

/**
 * Clear the ink layer and draw every mark again.
 *
 * ── WHY EVERYTHING, EVERY TIME ──────────────────────────────────────────────
 * Redrawing only what changed means tracking what changed, and a mistake there
 * leaves a ghost of a shape that was moved or deleted. At this scale (a handful
 * of marks on one picture) a full replay is imperceptible and cannot leave a
 * ghost, because the layer is empty before it starts.
 *
 * `inProgress` is the stroke under the finger right now, drawn last and never
 * committed. Without it a mark appears only when the finger lifts, and the tool
 * reads as broken rather than slow.
 */
export function redraw(
  ctx: RenderTarget,
  size: { width: number; height: number },
  objects: readonly DrawObject[],
  ink: Ink,
  inProgress: DrawObject | null = null,
  selected: { x: number; y: number; w: number; h: number } | null = null,
): void {
  ctx.clearRect(0, 0, size.width, size.height)
  // ── AN OBJECT `inProgress` IS A MOVING COPY OF IS DRAWN ONCE ──────────────
  // During a MOVE drag, `inProgress` is the same mark translated, and the
  // original is still in `objects` at its resting place. Painting both showed
  // the person a duplicate of their own mark that vanished on release. A mark
  // being DRAWN for the first time is not in `objects` at all, so this is a
  // no-op for the pen and the shapes — the id is what tells the two apart, and
  // it lives here rather than at the call site so every caller gets it.
  for (const object of objects) {
    if (inProgress !== null && object.id === inProgress.id) continue
    drawOne(ctx, object, ink)
  }
  if (inProgress !== null) drawOne(ctx, inProgress, ink)
  // Last, so it sits OVER the mark it describes rather than under it.
  if (selected !== null) drawSelection(ctx, selected, ink)
}

/**
 * The photograph and the marks, flattened into one picture.
 *
 * The ORDER is the whole thing: the background goes down first and the marks
 * over it. Reversed, the photograph covers every mark and the export is
 * indistinguishable from the original, which is a failure nobody would see until
 * they had paid for the generation.
 */
export function composite(
  ctx: RenderTarget,
  background: CanvasImageSource,
  size: { width: number; height: number },
  objects: readonly DrawObject[],
  ink: Ink,
): void {
  ctx.clearRect(0, 0, size.width, size.height)
  ctx.drawImage(background, 0, 0, size.width, size.height)
  for (const object of objects) drawOne(ctx, object, ink)
}

/**
 * The dashed box around the mark that is selected.
 *
 * ── A SELECTION NOBODY CAN SEE IS NOT A SELECTION ───────────────────────────
 * The pointer tool could pick a mark up and move it, and nothing on the screen
 * ever said which mark was picked. So a person dragged, watched something else
 * move, and concluded the tool was broken. This is the missing half of that
 * feature rather than decoration.
 *
 * Drawn in the SAME two colours as everything else, and always last, so it sits
 * over the mark it describes instead of under it.
 */
export function drawSelection(
  ctx: RenderTarget,
  box: { x: number; y: number; w: number; h: number },
  ink: Ink,
  pad = 8,
): void {
  ctx.save()
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  for (const [colour, width] of [
    [ink.edge, 5],
    [ink.fill, 2],
  ] as const) {
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.strokeRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2)
  }
  ctx.restore()
}
