import { describe, expect, it } from 'vitest'

import { paintFrom } from './paint'
import { renderSvg, type SceneNode, type SvgScene } from './svg'

const INK = paintFrom('#171717')!
const PAPER = paintFrom('#ffffff')!
const ACCENT = paintFrom('#ff6600')!

/** A 1x1 transparent PNG, as the only href shape the renderer will draw. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function scene(nodes: SceneNode[], over: Partial<SvgScene> = {}): SvgScene {
  return { width: 1080, height: 1080, background: PAPER, nodes, ...over }
}

describe('renderSvg produces one document both sides can read', () => {
  it('carries the namespace, the exact pixel size and a matching viewBox', () => {
    const out = renderSvg(scene([]))
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(out).toContain('width="1080"')
    expect(out).toContain('height="1080"')
    expect(out).toContain('viewBox="0 0 1080 1080"')
  })

  it('is byte-identical when called twice with the same scene', () => {
    const nodes: SceneNode[] = [
      { kind: 'rect', x: 0, y: 900, width: 1080, height: 180, fill: ACCENT },
      {
        kind: 'text',
        x: 540,
        y: 1000,
        text: 'Fresh samosas',
        fontFamily: 'Noto Sans',
        fontSize: 64,
        fontWeight: 700,
        fill: PAPER,
        anchor: 'middle',
      },
    ]
    expect(renderSvg(scene(nodes))).toBe(renderSvg(scene(nodes)))
  })

  it('paints the background before anything else, so nodes sit on top', () => {
    const out = renderSvg(
      scene([{ kind: 'rect', x: 10, y: 10, width: 5, height: 5, fill: ACCENT }]),
    )!
    expect(out.indexOf('#ffffff')).toBeLessThan(out.indexOf('#ff6600'))
  })

  it('keeps node order, because order is the only z-index there is', () => {
    const out = renderSvg(
      scene([
        { kind: 'rect', x: 0, y: 0, width: 1, height: 1, fill: INK },
        { kind: 'rect', x: 0, y: 0, width: 1, height: 1, fill: ACCENT },
      ]),
    )!
    expect(out.indexOf('#171717')).toBeLessThan(out.indexOf('#ff6600'))
  })
})

/**
 * THE RAIL THIS MODULE EXISTS FOR.
 *
 * A colour function reaching an SVG attribute rasterises to black with no
 * error. The type system makes that unreachable, and this asserts the output
 * end of it: whatever a caller does, no colour function can appear in the
 * markup.
 */
describe('no colour function can reach the markup', () => {
  it('emits only #rrggbb fills', () => {
    const out = renderSvg(
      scene([
        { kind: 'rect', x: 0, y: 0, width: 10, height: 10, fill: ACCENT },
        {
          kind: 'text',
          x: 0,
          y: 0,
          text: 'x',
          fontFamily: 'Noto Sans',
          fontSize: 12,
          fontWeight: 400,
          fill: INK,
        },
      ]),
    )!
    for (const fill of out.match(/fill="[^"]*"/g) ?? []) {
      expect(fill).toMatch(/^fill="#[0-9a-f]{6}"$/)
    }
    expect(out).not.toContain('oklch')
    expect(out).not.toContain('color-mix')
    expect(out).not.toContain('color(')
  })
})

describe('text is escaped, so what a person types cannot become markup', () => {
  it('escapes the five predefined entities', () => {
    const out = renderSvg(
      scene([
        {
          kind: 'text',
          x: 0,
          y: 0,
          text: `<script>alert("x")</script> & 'more'`,
          fontFamily: 'Noto Sans',
          fontSize: 12,
          fontWeight: 400,
          fill: INK,
        },
      ]),
    )!
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('&amp;')
    expect(out).toContain('&quot;')
    expect(out).toContain('&apos;')
  })

  it('escapes a font family that tries to close its own attribute', () => {
    const out = renderSvg(
      scene([
        {
          kind: 'text',
          x: 0,
          y: 0,
          text: 'hello',
          fontFamily: `Noto" onload="evil`,
          fontSize: 12,
          fontWeight: 400,
          fill: INK,
        },
      ]),
    )!
    expect(out).not.toContain('onload="evil"')
    expect(out).toContain('&quot;')
  })

  it('keeps Devanagari and Tamil text intact rather than escaping it away', () => {
    const out = renderSvg(
      scene([
        {
          kind: 'text',
          x: 0,
          y: 0,
          text: 'नमस्ते வணக்கம்',
          fontFamily: 'Noto Sans',
          fontSize: 12,
          fontWeight: 400,
          fill: INK,
        },
      ]),
    )!
    expect(out).toContain('नमस्ते')
    expect(out).toContain('வணக்கம்')
  })

  it('preserves whitespace, so a deliberate double space survives', () => {
    const out = renderSvg(
      scene([
        {
          kind: 'text',
          x: 0,
          y: 0,
          text: 'a  b',
          fontFamily: 'Noto Sans',
          fontSize: 12,
          fontWeight: 400,
          fill: INK,
        },
      ]),
    )!
    expect(out).toContain('xml:space="preserve"')
    expect(out).toContain('a  b')
  })
})

/**
 * THE OTHER RAIL: NOTHING IS FETCHED WHILE RENDERING.
 *
 * An http href would turn every export into a server-side request to an address
 * the document chose.
 */
describe('an image may only be a data URI', () => {
  it('draws a data URI', () => {
    const out = renderSvg(
      scene([{ kind: 'image', x: 0, y: 0, width: 100, height: 100, href: PIXEL }]),
    )
    expect(out).toContain('<image')
    expect(out).toContain('data:image/png;base64,')
  })

  it.each([
    'https://example.com/a.png',
    'http://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd',
    '//evil.example.com/a.png',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/svg+xml;base64,PHN2Zz4=',
  ])('refuses the whole render rather than drawing %s', (href) => {
    expect(
      renderSvg(scene([{ kind: 'image', x: 0, y: 0, width: 10, height: 10, href }])),
    ).toBeNull()
  })

  it('never drops a refused image quietly', () => {
    // The failure mode this prevents: a design that exports, uploads and
    // publishes with the customer's photo missing and nothing reporting it.
    const out = renderSvg(
      scene([
        { kind: 'rect', x: 0, y: 0, width: 10, height: 10, fill: ACCENT },
        { kind: 'image', x: 0, y: 0, width: 10, height: 10, href: 'https://example.com/a.png' },
      ]),
    )
    expect(out).toBeNull()
  })
})

describe('a scene that cannot be drawn honestly returns null', () => {
  it('refuses a size that is not a positive whole number of pixels', () => {
    for (const size of [0, -1, 10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(renderSvg(scene([], { width: size })), `width ${size}`).toBeNull()
      expect(renderSvg(scene([], { height: size })), `height ${size}`).toBeNull()
    }
  })

  it('refuses a node positioned at a value that is not a number', () => {
    expect(
      renderSvg(scene([{ kind: 'rect', x: Number.NaN, y: 0, width: 1, height: 1, fill: INK }])),
    ).toBeNull()
  })

  it('refuses a negative width and a font size of zero', () => {
    expect(
      renderSvg(scene([{ kind: 'rect', x: 0, y: 0, width: -1, height: 1, fill: INK }])),
    ).toBeNull()
    expect(
      renderSvg(
        scene([
          {
            kind: 'text',
            x: 0,
            y: 0,
            text: 'x',
            fontFamily: 'Noto Sans',
            fontSize: 0,
            fontWeight: 400,
            fill: INK,
          },
        ]),
      ),
    ).toBeNull()
  })

  it('renders an empty scene, because a blank canvas is a legal design', () => {
    expect(renderSvg(scene([]))).toContain('</svg>')
  })
})

describe('opacity travels in its own attribute', () => {
  it('emits fill-opacity below 1 and omits it at 1', () => {
    const half = paintFrom('#00000080')!
    const solid = paintFrom('#000000')!
    expect(
      renderSvg(scene([{ kind: 'rect', x: 0, y: 0, width: 1, height: 1, fill: half }])),
    ).toContain('fill-opacity=')
    expect(
      renderSvg(scene([{ kind: 'rect', x: 0, y: 0, width: 1, height: 1, fill: solid }])),
    ).not.toContain('fill-opacity=')
  })
})
