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
    const once = renderSvg(scene(nodes))
    // Without this the assertion below is satisfied by null === null, and would
    // pass for a scene that never rendered at all. Caught by an adversarial
    // review: it was the ONLY evidence behind the determinism claim.
    expect(once).not.toBeNull()
    expect(once).toContain('<text')
    expect(once).toBe(renderSvg(scene(nodes)))
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
    const fills = out.match(/fill="[^"]*"/g) ?? []
    // Assert the COUNT first. Without it the loop passes vacuously if a colour
    // ever leaves the fill attribute: background + rect + text = 3.
    expect(fills).toHaveLength(3)
    for (const fill of fills) {
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

/**
 * THE TWO HOLES AN ADVERSARIAL REVIEW FOUND IN THE FIRST COMMIT.
 *
 * Both were reachable because TypeScript's types are erased at runtime, and
 * both were reproduced against the shipped code before being fixed.
 */
describe('the runtime holes that types did not close', () => {
  it('refuses a paint channel that is not a real number, rather than emitting #NaN0000', () => {
    // MEASURED against the first commit: hexOf({r: NaN, ...}) returned the
    // string "#NaN0000", renderSvg put it in a fill attribute, and the
    // rasteriser painted it pure black. That is the exact failure paint.ts
    // exists to prevent, arriving through paint.ts.
    const broken = { r: Number.NaN, g: 0, b: 0, a: 1 }
    const out = renderSvg(scene([{ kind: 'rect', x: 0, y: 0, width: 5, height: 5, fill: broken }]))
    expect(out).toBeNull()
  })

  it('refuses a non-finite background too', () => {
    expect(
      renderSvg(scene([], { background: { r: 0, g: 0, b: Number.POSITIVE_INFINITY, a: 1 } })),
    ).toBeNull()
  })

  it('refuses a text anchor that is not one of the three legal values', () => {
    // MEASURED against the first commit: this exact anchor produced markup
    // containing a LIVE <image href="http://169.254.169.254/">, walking past
    // the data-URI check entirely. `anchor` was the one interpolation with
    // neither escapeXml nor num around it.
    const injection =
      '"/><image href="http://169.254.169.254/" width="10" height="10"/><text a="' as never
    const out = renderSvg(
      scene([
        {
          kind: 'text',
          x: 0,
          y: 0,
          text: 'hi',
          fontFamily: 'Noto Sans',
          fontSize: 10,
          fontWeight: 400,
          fill: INK,
          anchor: injection,
        },
      ]),
    )
    expect(out).toBeNull()
  })

  it('still accepts the three legal anchors', () => {
    for (const anchor of ['start', 'middle', 'end'] as const) {
      const out = renderSvg(
        scene([
          {
            kind: 'text',
            x: 0,
            y: 0,
            text: 'hi',
            fontFamily: 'Noto Sans',
            fontSize: 10,
            fontWeight: 400,
            fill: INK,
            anchor,
          },
        ]),
      )
      expect(out, `anchor ${anchor}`).toContain(`text-anchor="${anchor}"`)
    }
  })

  it('refuses a text or family that is not a string instead of throwing', () => {
    const notAString = 42 as never
    expect(
      renderSvg(
        scene([
          {
            kind: 'text',
            x: 0,
            y: 0,
            text: notAString,
            fontFamily: 'Noto Sans',
            fontSize: 10,
            fontWeight: 400,
            fill: INK,
          },
        ]),
      ),
    ).toBeNull()
    expect(
      renderSvg(
        scene([
          {
            kind: 'text',
            x: 0,
            y: 0,
            text: 'hi',
            fontFamily: notAString,
            fontSize: 10,
            fontWeight: 400,
            fill: INK,
          },
        ]),
      ),
    ).toBeNull()
  })

  it('no injected node can survive into the markup', () => {
    // The property behind all of the above: whatever a caller does, the output
    // is either null or contains exactly the elements the scene declared.
    const out = renderSvg(
      scene([
        {
          kind: 'text',
          x: 0,
          y: 0,
          text: 'hi',
          fontFamily: 'Noto Sans',
          fontSize: 10,
          fontWeight: 400,
          fill: INK,
          anchor: '"/><image href="http://evil.example.com/"/><text a="' as never,
        },
      ]),
    )
    expect(out).toBeNull()
  })
})
