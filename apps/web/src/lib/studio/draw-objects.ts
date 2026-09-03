/**
 * WHAT SOMEBODY HAS DRAWN, AS OBJECTS RATHER THAN PIXELS.
 *
 * ── WHY A LIST OF SHAPES AND NOT A BITMAP ───────────────────────────────────
 * A bitmap can only be added to. Once a stroke is burned into pixels there is no
 * stroke any more, so it cannot be moved, recoloured, or removed without also
 * removing whatever was underneath it. Every useful thing a person expects from
 * a drawing tool, undo that does not eat the photograph, moving a box after
 * placing it, an eraser that takes back a line rather than painting over the
 * picture, needs the marks to still BE marks.
 *
 * So this module holds a list, and the renderer replays it. The photograph is a
 * separate layer underneath that nothing here can touch, which is what makes the
 * eraser safe by construction rather than by care.
 *
 * ── AND IT IS PURE ──────────────────────────────────────────────────────────
 * No canvas, no DOM, no clock, no randomness beyond an id the caller supplies.
 * The whole editor's correctness lives in this file and can be tested without a
 * browser: what a stroke is, what moving one means, what undo restores.
 */

export const DRAW_TOOLS = ['pointer', 'pencil', 'eraser', 'rect', 'arrow', 'text'] as const
export type DrawTool = (typeof DRAW_TOOLS)[number]

/** A point in the picture's own coordinates, never the screen's. */
export type Point = { x: number; y: number }

export type DrawObject =
  | { kind: 'stroke'; id: string; points: Point[]; width: number }
  | { kind: 'rect'; id: string; from: Point; to: Point; width: number }
  | { kind: 'arrow'; id: string; from: Point; to: Point; width: number }
  | { kind: 'text'; id: string; at: Point; text: string; size: number }

/**
 * The whole editable state.
 *
 * `past` and `future` are SNAPSHOTS of the object list, not a log of edits.
 * At this scale (a person drawing a handful of marks on one picture) copying an
 * array is free, and a snapshot cannot drift from the thing it is meant to
 * restore the way an inverse-operation log can.
 */
export type DrawState = {
  objects: DrawObject[]
  past: DrawObject[][]
  future: DrawObject[][]
}

export function emptyDrawing(): DrawState {
  return { objects: [], past: [], future: [] }
}

/**
 * Record an edit.
 *
 * ── WHY THE FUTURE IS THROWN AWAY ───────────────────────────────────────────
 * Undoing twice and then drawing something new creates a branch, and the two
 * futures cannot both be reachable by pressing redo. Keeping the old one would
 * let redo replace what the person just drew with something they had already
 * rejected, which is the worst possible behaviour for a button labelled redo.
 */
export function commit(state: DrawState, objects: DrawObject[]): DrawState {
  return { objects, past: [...state.past, state.objects], future: [] }
}

export function undo(state: DrawState): DrawState {
  const previous = state.past[state.past.length - 1]
  if (previous === undefined) return state
  return {
    objects: previous,
    past: state.past.slice(0, -1),
    future: [state.objects, ...state.future],
  }
}

export function redo(state: DrawState): DrawState {
  const next = state.future[0]
  if (next === undefined) return state
  return {
    objects: next,
    past: [...state.past, state.objects],
    future: state.future.slice(1),
  }
}

export const canUndo = (state: DrawState): boolean => state.past.length > 0
export const canRedo = (state: DrawState): boolean => state.future.length > 0

/**
 * Where a pointer event landed, in the PICTURE's coordinates.
 *
 * ── THE CONVERSION THIS EXISTS FOR ──────────────────────────────────────────
 * The canvas is drawn at the picture's real size (1080 by 1920, say) and shown
 * at whatever width the screen allows (maybe 380). A pointer at 190 across the
 * displayed element is at 540 in the picture. Skipping this is the classic
 * drawing-tool bug: marks land near the top left and drift further out the
 * bigger the picture, and it looks like a rendering problem rather than an
 * arithmetic one.
 */
export function toPicturePoint(input: {
  clientX: number
  clientY: number
  rect: { left: number; top: number; width: number; height: number }
  picture: { width: number; height: number }
}): Point {
  // A zero-sized rect happens for one frame while a dialog opens. Dividing by it
  // gives Infinity and puts a mark nowhere, so the origin is returned instead:
  // wrong by a few pixels for one frame, rather than lost.
  if (input.rect.width === 0 || input.rect.height === 0) return { x: 0, y: 0 }

  return {
    x: ((input.clientX - input.rect.left) / input.rect.width) * input.picture.width,
    y: ((input.clientY - input.rect.top) / input.rect.height) * input.picture.height,
  }
}

/**
 * The same object, moved.
 *
 * Takes the ORIGINAL and a total offset, never the current object and a frame
 * delta. Offsetting the current one every frame accumulates rounding, and the
 * shape slowly drifts away from the cursor over a long drag.
 */
export function translateObject(object: DrawObject, dx: number, dy: number): DrawObject {
  const move = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy })
  switch (object.kind) {
    case 'stroke':
      return { ...object, points: object.points.map(move) }
    case 'rect':
    case 'arrow':
      return { ...object, from: move(object.from), to: move(object.to) }
    case 'text':
      return { ...object, at: move(object.at) }
  }
}

/** The box a shape occupies, for hit testing. */
export function boundsOf(object: DrawObject): { x: number; y: number; w: number; h: number } {
  const points: Point[] =
    object.kind === 'stroke'
      ? object.points
      : object.kind === 'text'
        ? [
            object.at,
            {
              x: object.at.x + object.text.length * object.size * 0.6,
              y: object.at.y - object.size,
            },
          ]
        : [object.from, object.to]

  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

/**
 * The topmost object under this point, or null.
 *
 * ── TOPMOST, BECAUSE THAT IS THE ONE BEING POINTED AT ───────────────────────
 * Later objects are drawn over earlier ones, so the one a person can SEE at that
 * point is the last one whose box contains it. Returning the first match would
 * select the thing underneath, which reads as the tool ignoring the click.
 *
 * `slack` widens every box, because a one-pixel line is impossible to hit with a
 * finger and only slightly easier with a mouse.
 */
export function objectAt(
  objects: readonly DrawObject[],
  point: Point,
  slack = 8,
): DrawObject | null {
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const object = objects[i]!
    const box = boundsOf(object)
    if (
      point.x >= box.x - slack &&
      point.x <= box.x + box.w + slack &&
      point.y >= box.y - slack &&
      point.y <= box.y + box.h + slack
    ) {
      return object
    }
  }
  return null
}

/** Remove one object by id, leaving everything else in its order. */
export function removeObject(objects: readonly DrawObject[], id: string): DrawObject[] {
  return objects.filter((object) => object.id !== id)
}

/** Replace one object by id, keeping its position in the stack. */
export function replaceObject(objects: readonly DrawObject[], next: DrawObject): DrawObject[] {
  return objects.map((object) => (object.id === next.id ? next : object))
}
