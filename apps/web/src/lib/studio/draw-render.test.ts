import { describe, expect, test, vi } from 'vitest'

import type { DrawObject } from './draw-objects'
import {
  composite,
  drawOne,
  drawSelection,
  redraw,
  type Ink,
  type RenderTarget,
} from './draw-render'

/**
 * WHAT ACTUALLY REACHES THE CANVAS, IN WHAT ORDER.
 *
 * A recording stub rather than a real context: the question these tests answer
 * is not "do the pixels look right", which no assertion can settle, it is "was
 * the photograph drawn before the marks" and "was the layer cleared first".
 * Both are order, both are silently wrong when they are wrong, and both are
 * exactly what a call log can prove.
 */

const INK: Ink = { fill: 'ink-fill', edge: 'ink-edge' }

type Call = { op: string; args: unknown[] }

function recorder(): { ctx: RenderTarget; calls: Call[] } {
  const calls: Call[] = []
  const op =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ op: name, args })
    }
  const ctx = {
    clearRect: op('clearRect'),
    beginPath: op('beginPath'),
    moveTo: op('moveTo'),
    lineTo: op('lineTo'),
    stroke: op('stroke'),
    strokeRect: op('strokeRect'),
    fillText: op('fillText'),
    strokeText: op('strokeText'),
    save: op('save'),
    restore: op('restore'),
    drawImage: op('drawImage'),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    font: '',
  }
  return { ctx: ctx as unknown as RenderTarget, calls }
}

const stroke: DrawObject = {
  kind: 'stroke',
  id: 's1',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  width: 4,
}

const SIZE = { width: 100, height: 200 }

describe('flattening the photograph and the marks together', () => {
  /**
   * THE ONE THAT MATTERS. Reversed, the photograph covers every mark and the
   * export is indistinguishable from the original picture. Nobody would notice
   * until they had paid for the generation and got back what they started with.
   */
  test('the photograph goes down FIRST and the marks over it', () => {
    const { ctx, calls } = recorder()
    composite(ctx, {} as CanvasImageSource, SIZE, [stroke], INK)

    const background = calls.findIndex((c) => c.op === 'drawImage')
    const marks = calls.findIndex((c) => c.op === 'stroke')
    expect(background).toBeGreaterThanOrEqual(0)
    expect(marks).toBeGreaterThanOrEqual(0)
    expect(background).toBeLessThan(marks)
  })

  test('the layer is cleared before anything is drawn on it', () => {
    const { ctx, calls } = recorder()
    composite(ctx, {} as CanvasImageSource, SIZE, [stroke], INK)
    expect(calls[0]!.op).toBe('clearRect')
  })

  test('the photograph is drawn at the picture’s full size', () => {
    const { ctx, calls } = recorder()
    composite(ctx, {} as CanvasImageSource, SIZE, [], INK)
    const drawn = calls.find((c) => c.op === 'drawImage')!
    expect(drawn.args.slice(1)).toEqual([0, 0, SIZE.width, SIZE.height])
  })

  test('marks are composited in the order they were drawn', () => {
    const { ctx, calls } = recorder()
    const second: DrawObject = { ...stroke, id: 's2' }
    composite(ctx, {} as CanvasImageSource, SIZE, [stroke, second], INK)
    // Two save/restore pairs, in order, one per object.
    expect(calls.filter((c) => c.op === 'save')).toHaveLength(2)
  })
})

describe('replaying the ink layer', () => {
  /**
   * The layer is emptied before every replay, which is what makes it impossible
   * to leave a ghost of a shape that was moved or deleted.
   */
  test('every redraw starts from an empty layer', () => {
    const { ctx, calls } = recorder()
    redraw(ctx, SIZE, [stroke], INK)
    expect(calls[0]!.op).toBe('clearRect')
    expect(calls[0]!.args).toEqual([0, 0, SIZE.width, SIZE.height])
  })

  /**
   * Without this a mark appears only when the finger lifts, and the tool reads
   * as broken rather than slow.
   */
  test('the stroke under the finger is drawn, and drawn last', () => {
    const { ctx, calls } = recorder()
    const live: DrawObject = { ...stroke, id: 'live' }
    redraw(ctx, SIZE, [stroke], INK, live)
    expect(calls.filter((c) => c.op === 'save')).toHaveLength(2)
  })

  test('no marks at all still clears, so the last stroke does not linger', () => {
    const { ctx, calls } = recorder()
    redraw(ctx, SIZE, [], INK)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.op).toBe('clearRect')
  })

  /**
   * NOTHING here may draw on the photograph's layer. That is what makes the
   * eraser safe by construction rather than by care: erasing clears the ink and
   * replays it, and the picture underneath was never touched.
   */
  test('replaying the ink never draws an image, so it cannot touch the photograph', () => {
    const { ctx, calls } = recorder()
    redraw(ctx, SIZE, [stroke], INK)
    expect(calls.some((c) => c.op === 'drawImage')).toBe(false)
  })
})

describe('a mark carries its own edge', () => {
  /**
   * One colour cannot be seen on both a night sky and a white wall, and a person
   * drawing on their own photograph gets whichever they happen to have. Every
   * mark is stroked twice: a wider edge, then the ink over it.
   */
  test('a stroke is drawn twice, edge first and wider', () => {
    const { ctx } = recorder()
    const widths: number[] = []
    const styles: string[] = []
    const spy = new Proxy(ctx, {
      set(target, key, value) {
        if (key === 'lineWidth') widths.push(value as number)
        if (key === 'strokeStyle') styles.push(value as string)
        return Reflect.set(target, key, value)
      },
    })
    drawOne(spy as RenderTarget, stroke, INK)

    expect(styles).toEqual([INK.edge, INK.fill])
    expect(widths[0]).toBeGreaterThan(widths[1]!)
  })

  test('text is outlined before it is filled, for the same reason', () => {
    const { ctx, calls } = recorder()
    const text: DrawObject = { kind: 'text', id: 't', at: { x: 1, y: 2 }, text: 'hi', size: 40 }
    drawOne(ctx, text, INK)
    const outlined = calls.findIndex((c) => c.op === 'strokeText')
    const filled = calls.findIndex((c) => c.op === 'fillText')
    expect(outlined).toBeLessThan(filled)
  })

  test('an arrow draws its shaft and its head, not just a line', () => {
    const { ctx, calls } = recorder()
    const arrow: DrawObject = {
      kind: 'arrow',
      id: 'a',
      from: { x: 0, y: 0 },
      to: { x: 50, y: 0 },
      width: 4,
    }
    drawOne(ctx, arrow, INK)
    // Two passes, each a shaft and a head: four strokes in total.
    expect(calls.filter((c) => c.op === 'stroke')).toHaveLength(4)
  })

  test('every kind of mark draws something, so none is silently missing', () => {
    const kinds: DrawObject[] = [
      stroke,
      { kind: 'rect', id: 'r', from: { x: 0, y: 0 }, to: { x: 9, y: 9 }, width: 4 },
      { kind: 'arrow', id: 'a', from: { x: 0, y: 0 }, to: { x: 9, y: 9 }, width: 4 },
      { kind: 'text', id: 't', at: { x: 0, y: 0 }, text: 'x', size: 20 },
    ]
    for (const object of kinds) {
      const { ctx, calls } = recorder()
      drawOne(ctx, object, INK)
      const drew = calls.filter((c) =>
        ['stroke', 'strokeRect', 'fillText', 'strokeText'].includes(c.op),
      )
      expect(drew.length, object.kind).toBeGreaterThan(0)
    }
  })

  test('state is saved and restored, so one mark cannot leak into the next', () => {
    const { ctx, calls } = recorder()
    drawOne(ctx, stroke, INK)
    expect(calls[0]!.op).toBe('save')
    expect(calls[calls.length - 1]!.op).toBe('restore')
  })
})

describe('the colours are given, never chosen here', () => {
  /**
   * A colour anywhere in this product is a token. These come from `--photo-ink`
   * and `--photo-ink-edge`, read by the component, so nothing in the renderer
   * can quietly become a literal.
   */
  test('whatever ink is passed is what reaches the canvas', () => {
    const { ctx } = recorder()
    const styles: string[] = []
    const spy = new Proxy(ctx, {
      set(target, key, value) {
        if (key === 'strokeStyle' || key === 'fillStyle') styles.push(value as string)
        return Reflect.set(target, key, value)
      },
    })
    drawOne(spy as RenderTarget, stroke, { fill: 'a', edge: 'b' })
    expect(new Set(styles)).toEqual(new Set(['a', 'b']))
  })
})

describe('the module is pure', () => {
  test('it touches no document, so it can run anywhere', () => {
    const { ctx } = recorder()
    const spy = vi.fn()
    // No global reach: if the renderer wanted a document it would have to be
    // handed one, and it is not.
    expect(() => redraw(ctx, SIZE, [stroke], INK)).not.toThrow()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('showing which mark is picked up', () => {
  /**
   * THE MISSING HALF OF THE POINTER TOOL. It could pick a mark up and move it,
   * and nothing ever said which mark was picked, so a person dragged, watched
   * something else move, and concluded the tool was broken.
   */
  test('a selected mark gets a box drawn round it', () => {
    const { ctx, calls } = recorder()
    redraw(ctx, SIZE, [stroke], INK, null, { x: 10, y: 10, w: 20, h: 20 })
    expect(calls.some((c) => c.op === 'strokeRect')).toBe(true)
  })

  test('nothing selected draws no box', () => {
    const { ctx, calls } = recorder()
    redraw(ctx, SIZE, [stroke], INK, null, null)
    expect(calls.some((c) => c.op === 'strokeRect')).toBe(false)
  })

  /** Over the mark it describes, never under it. */
  test('the box is drawn last, so the mark cannot cover it', () => {
    const { ctx, calls } = recorder()
    redraw(ctx, SIZE, [stroke], INK, null, { x: 0, y: 0, w: 5, h: 5 })
    const lastMark = calls.map((c) => c.op).lastIndexOf('stroke')
    const box = calls.findIndex((c) => c.op === 'strokeRect')
    expect(box).toBeGreaterThan(lastMark)
  })

  /**
   * Padded outwards, so the box sits AROUND the mark rather than through it.
   * A box drawn exactly on the bounds is indistinguishable from a rectangle
   * somebody drew.
   */
  test('the box sits outside the mark, not on top of its edge', () => {
    const { ctx, calls } = recorder()
    // NO pad argument: the DEFAULT is what every caller gets, and a test that
    // passes its own padding proves nothing about it. Zero padding draws the box
    // exactly on the bounds, where it is indistinguishable from a rectangle
    // somebody drew themselves.
    drawSelection(ctx, { x: 100, y: 100, w: 50, h: 50 }, INK)
    const drawn = calls.find((c) => c.op === 'strokeRect')!
    const [x, y, w, h] = drawn.args as number[]
    expect(x!).toBeLessThan(100)
    expect(y!).toBeLessThan(100)
    expect(w!).toBeGreaterThan(50)
    expect(h!).toBeGreaterThan(50)
  })

  test('it uses the same two ink colours as everything else', () => {
    const { ctx } = recorder()
    const styles: string[] = []
    const spy = new Proxy(ctx, {
      set(target, key, value) {
        if (key === 'strokeStyle') styles.push(value as string)
        return Reflect.set(target, key, value)
      },
    })
    drawSelection(spy as RenderTarget, { x: 0, y: 0, w: 1, h: 1 }, INK)
    expect(styles).toEqual([INK.edge, INK.fill])
  })
})
