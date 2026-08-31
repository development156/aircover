import { describe, expect, test } from 'vitest'

import {
  boundsOf,
  canRedo,
  canUndo,
  commit,
  emptyDrawing,
  objectAt,
  redo,
  removeObject,
  replaceObject,
  toPicturePoint,
  translateObject,
  undo,
  type DrawObject,
} from './draw-objects'

/**
 * THE WHOLE EDITOR'S CORRECTNESS, TESTED WITHOUT A BROWSER.
 *
 * Every rule about what a mark IS lives in the pure module, so it can be proved
 * here rather than eyeballed on a canvas. What a canvas test could add is that
 * the pixels appear, and that is not where the bugs are.
 */

const stroke = (id = 's1'): DrawObject => ({
  kind: 'stroke',
  id,
  points: [
    { x: 10, y: 10 },
    { x: 20, y: 30 },
  ],
  width: 4,
})

const rect = (id = 'r1'): DrawObject => ({
  kind: 'rect',
  id,
  from: { x: 100, y: 100 },
  to: { x: 200, y: 150 },
  width: 4,
})

describe('undo and redo', () => {
  test('nothing to undo leaves the drawing exactly as it was', () => {
    const state = emptyDrawing()
    expect(undo(state)).toEqual(state)
    expect(redo(state)).toEqual(state)
    expect(canUndo(state)).toBe(false)
    expect(canRedo(state)).toBe(false)
  })

  test('undo restores what was there before the edit', () => {
    const one = commit(emptyDrawing(), [stroke()])
    const two = commit(one, [stroke(), rect()])
    expect(undo(two).objects).toEqual([stroke()])
    expect(undo(undo(two)).objects).toEqual([])
  })

  test('redo puts back exactly what undo took away', () => {
    const two = commit(commit(emptyDrawing(), [stroke()]), [stroke(), rect()])
    expect(redo(undo(two)).objects).toEqual(two.objects)
  })

  /**
   * THE ONE THAT MATTERS. Undoing and then drawing something new creates a
   * branch, and both futures cannot be reachable by one redo button. Keeping the
   * old future would let redo REPLACE what the person just drew with something
   * they had already rejected, which is the worst possible behaviour for a
   * button labelled redo.
   */
  test('drawing after an undo makes redo unreachable, rather than restoring a rejected branch', () => {
    const two = commit(commit(emptyDrawing(), [stroke()]), [stroke(), rect()])
    const backOne = undo(two)
    expect(canRedo(backOne)).toBe(true)

    const branched = commit(backOne, [stroke(), rect('r2')])
    expect(canRedo(branched)).toBe(false)
    expect(redo(branched).objects).toEqual([stroke(), rect('r2')])
  })

  test('a commit never mutates the state it was given', () => {
    const before = emptyDrawing()
    const snapshot = JSON.parse(JSON.stringify(before))
    commit(before, [stroke()])
    expect(before).toEqual(snapshot)
  })
})

describe('where a pointer landed', () => {
  /**
   * THE CLASSIC DRAWING-TOOL BUG. The canvas is drawn at the picture's real size
   * and shown at whatever the screen allows. Without this conversion marks land
   * near the top left and drift further out the bigger the picture, which reads
   * as a rendering fault rather than arithmetic.
   */
  test('a display-scaled pointer becomes a picture coordinate', () => {
    const point = toPicturePoint({
      clientX: 190,
      clientY: 100,
      rect: { left: 0, top: 0, width: 380, height: 380 },
      picture: { width: 1080, height: 1080 },
    })
    expect(point.x).toBeCloseTo(540)
    expect(point.y).toBeCloseTo(284.21, 1)
  })

  test('the element’s own offset is subtracted, not ignored', () => {
    const point = toPicturePoint({
      clientX: 150,
      clientY: 60,
      rect: { left: 100, top: 50, width: 100, height: 100 },
      picture: { width: 1000, height: 1000 },
    })
    expect(point).toEqual({ x: 500, y: 100 })
  })

  test('a one-to-one canvas needs no correction at all', () => {
    const point = toPicturePoint({
      clientX: 42,
      clientY: 7,
      rect: { left: 0, top: 0, width: 100, height: 100 },
      picture: { width: 100, height: 100 },
    })
    // Close, not equal: the identity ratio still goes through a division and
    // comes back as 7.000000000000001. Asserting exactness here would pin a
    // floating-point artefact rather than the claim, which is that a mark lands
    // where the finger did.
    expect(point.x).toBeCloseTo(42, 10)
    expect(point.y).toBeCloseTo(7, 10)
  })

  /**
   * A zero-sized rect happens for one frame while a dialog opens. Dividing by it
   * gives Infinity and puts the mark nowhere at all.
   */
  test('a canvas with no size yet gives the origin rather than infinity', () => {
    const point = toPicturePoint({
      clientX: 10,
      clientY: 10,
      rect: { left: 0, top: 0, width: 0, height: 0 },
      picture: { width: 100, height: 100 },
    })
    expect(point).toEqual({ x: 0, y: 0 })
    expect(Number.isFinite(point.x)).toBe(true)
  })
})

describe('moving a shape', () => {
  test('every point of a stroke moves by the same offset', () => {
    const moved = translateObject(stroke(), 5, -5)
    expect(moved).toEqual({
      kind: 'stroke',
      id: 's1',
      points: [
        { x: 15, y: 5 },
        { x: 25, y: 25 },
      ],
      width: 4,
    })
  })

  test('a box moves both corners, so it keeps its size', () => {
    const moved = translateObject(rect(), 10, 10)
    const box = boundsOf(moved)
    expect(box.w).toBe(boundsOf(rect()).w)
    expect(box.h).toBe(boundsOf(rect()).h)
  })

  /**
   * Offsetting the CURRENT object every frame accumulates rounding and the shape
   * drifts away from the cursor over a long drag. Applying a total offset to the
   * original is exact however many frames pass.
   */
  test('a total offset from the original is exact, where per-frame deltas drift', () => {
    const original = rect()
    let perFrame = original
    for (let i = 0; i < 300; i += 1) perFrame = translateObject(perFrame, 0.1, 0.1)

    const fromOriginal = translateObject(original, 30, 30)
    expect(boundsOf(fromOriginal).x).toBe(130)
    // The per-frame path is the one that cannot be trusted, which is why the
    // component never uses it.
    expect(boundsOf(perFrame).x).not.toBe(130)
  })

  test('moving never mutates the object it was given', () => {
    const original = stroke()
    const snapshot = JSON.parse(JSON.stringify(original))
    translateObject(original, 100, 100)
    expect(original).toEqual(snapshot)
  })
})

describe('what is under the pointer', () => {
  /**
   * Later objects are drawn OVER earlier ones, so the one a person can see at a
   * point is the last whose box contains it. Returning the first match selects
   * the thing underneath, which reads as the tool ignoring the click.
   */
  test('the topmost overlapping shape wins, not the first drawn', () => {
    const under = { ...rect('under'), from: { x: 0, y: 0 }, to: { x: 300, y: 300 } } as DrawObject
    const over = rect('over')
    expect(objectAt([under, over], { x: 150, y: 120 })?.id).toBe('over')
  })

  test('a point well outside everything selects nothing', () => {
    expect(objectAt([rect()], { x: 900, y: 900 })).toBeNull()
  })

  /**
   * A one-pixel line is impossible to hit with a finger and only slightly easier
   * with a mouse, so every box is widened.
   */
  test('a near miss still hits, because a finger is not a pixel', () => {
    expect(objectAt([rect()], { x: 96, y: 100 })).not.toBeNull()
    expect(objectAt([rect()], { x: 96, y: 100 }, 0)).toBeNull()
  })

  test('an empty drawing has nothing under any point', () => {
    expect(objectAt([], { x: 0, y: 0 })).toBeNull()
  })
})

describe('changing the list', () => {
  test('removing takes one out and leaves the rest in order', () => {
    expect(removeObject([stroke('a'), rect('b'), stroke('c')], 'b').map((o) => o.id)).toEqual([
      'a',
      'c',
    ])
  })

  test('removing something that is not there changes nothing', () => {
    const objects = [stroke('a')]
    expect(removeObject(objects, 'nope')).toEqual(objects)
  })

  /**
   * Position in the list IS the stacking order, so replacing has to keep it. A
   * replace that removed and appended would send a shape somebody just moved to
   * the front of everything.
   */
  test('replacing keeps the object’s place in the stack', () => {
    const moved = translateObject(rect('b'), 5, 5)
    const after = replaceObject([stroke('a'), rect('b'), stroke('c')], moved)
    expect(after.map((o) => o.id)).toEqual(['a', 'b', 'c'])
    expect(boundsOf(after[1]!).x).toBe(105)
  })
})

describe('the box a shape occupies', () => {
  test('a stroke is bounded by its own points', () => {
    expect(boundsOf(stroke())).toEqual({ x: 10, y: 10, w: 10, h: 20 })
  })

  test('a box drawn upwards still has a positive size', () => {
    const upward: DrawObject = {
      kind: 'rect',
      id: 'r',
      from: { x: 200, y: 150 },
      to: { x: 100, y: 100 },
      width: 4,
    }
    expect(boundsOf(upward)).toEqual({ x: 100, y: 100, w: 100, h: 50 })
  })

  test('an empty stroke has an empty box rather than an infinite one', () => {
    const empty: DrawObject = { kind: 'stroke', id: 'e', points: [], width: 4 }
    expect(boundsOf(empty)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  test('text is bounded above its baseline, where it is actually drawn', () => {
    const text: DrawObject = {
      kind: 'text',
      id: 't',
      at: { x: 50, y: 100 },
      text: 'hello',
      size: 40,
    }
    expect(boundsOf(text).y).toBe(60)
    expect(boundsOf(text).h).toBe(40)
  })
})
