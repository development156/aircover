import { describe, it, expect } from 'vitest'
import type { ThemeTokens } from '@sahoda/shared'
import { BRAND_VAR_NAMES, brandSkinVars, themeCss } from './css'

const theme = (overrides: Partial<ThemeTokens> = {}): ThemeTokens => ({
  primary: 'oklch(0.62 0.14 250)',
  primaryFg: 'oklch(1 0 0)',
  secondary: 'oklch(0.96 0 0)',
  accent: 'oklch(0.55 0.16 30)',
  surface: ['oklch(1 0 0)', 'oklch(0.99 0 0)', 'oklch(0.97 0 0)', 'oklch(0.91 0 0)'],
  text: { hi: 'oklch(0.19 0 0)', mid: 'oklch(0.44 0 0)', low: 'oklch(0.7 0 0)' },
  border: 'oklch(0.91 0 0)',
  success: 'oklch(0.5 0.13 150)',
  warning: 'oklch(0.58 0.13 60)',
  danger: 'oklch(0.53 0.2 27)',
  radius: '12px',
  fontHeading: 'Outfit',
  fontBody: 'Outfit',
  ...overrides,
})

describe('BRAND_VAR_NAMES', () => {
  it('is exactly the seven vars a workspace theme may override, in emission order', () => {
    expect([...BRAND_VAR_NAMES]).toEqual([
      '--p',
      '--pfg',
      '--pstrong',
      '--acc',
      '--t50',
      '--t100',
      '--t300',
    ])
  })
})

describe('themeCss — no active theme is the default path', () => {
  it('returns an empty string for null, because workspace_themes is never seeded', () => {
    // The seed migration has zero workspace_themes rows, so the overwhelming
    // majority of renders take this branch and must emit no override block at all.
    expect(themeCss(null)).toBe('')
  })
})

describe('themeCss — a present theme', () => {
  it('emits every one of the seven brand vars', () => {
    const css = themeCss(theme())

    for (const name of BRAND_VAR_NAMES) {
      expect(css).toContain(`${name}:`)
    }
  })

  it('emits the exact block for the reference theme, byte for byte', () => {
    expect(themeCss(theme())).toBe(
      ':root{' +
        '--p:oklch(0.62 0.14 250);' +
        '--pfg:var(--ink);' +
        '--pstrong:oklch(0.52 0.14 250);' +
        '--acc:oklch(0.55 0.16 30);' +
        '--t50:oklch(0.97 0.02 250);' +
        '--t100:oklch(0.93 0.05 250);' +
        '--t300:oklch(0.78 0.14 250);' +
        '}',
    )
  })

  it('is valid `:root{...}` syntax with no stray blocks', () => {
    const css = themeCss(theme())

    expect(css).toMatch(/^:root\{(?:--[a-z0-9]+:[^;{}]+;)+\}$/)
  })

  it('contains exactly one opening and one closing brace, proving nothing escaped the parse', () => {
    const css = themeCss(theme({ accent: 'oklch(0.4 0.2 300)' }))

    expect(css.match(/\{/g)).toHaveLength(1)
    expect(css.match(/\}/g)).toHaveLength(1)
  })
})

describe('brandSkinVars — the four re-derivations ThemeTokens cannot carry', () => {
  // ThemeTokens has no field for --pstrong/--t50/--t100/--t300, so each is
  // recomputed from the GUARDED primary (l, c, h) with a locked formula.
  const DERIVATIONS: Array<{ name: string; formula: string; expected: string }> = [
    { name: '--pstrong', formula: 'l - 0.1', expected: 'oklch(0.52 0.14 250)' },
    { name: '--t50', formula: 'oklch(0.97, min(c, 0.02), h)', expected: 'oklch(0.97 0.02 250)' },
    { name: '--t100', formula: 'oklch(0.93, min(c, 0.05), h)', expected: 'oklch(0.93 0.05 250)' },
    {
      name: '--t300',
      formula: 'oklch(0.78, clamp(c, 0.08, 0.16), h)',
      expected: 'oklch(0.78 0.14 250)',
    },
  ]

  for (const { name, formula, expected } of DERIVATIONS) {
    it(`derives ${name} as ${formula} => ${expected}`, () => {
      const vars = brandSkinVars(theme())

      expect(vars).not.toBeNull()
      expect(vars?.[name]).toBe(expected)
    })
  }

  it('clamps t50 and t100 chroma DOWN for a saturated primary, keeping tints pale', () => {
    const vars = brandSkinVars(theme({ primary: 'oklch(0.6657 0.225 36.6)' }))

    expect(vars?.['--t50']).toBe('oklch(0.97 0.02 36.6)')
    expect(vars?.['--t100']).toBe('oklch(0.93 0.05 36.6)')
    expect(vars?.['--t300']).toBe('oklch(0.78 0.16 36.6)')
  })

  it('clamps t300 chroma UP for a near-grey primary, so the 300 tint still reads as brand', () => {
    const vars = brandSkinVars(theme({ primary: 'oklch(0.7 0.01 180)' }))

    expect(vars?.['--t50']).toBe('oklch(0.97 0.01 180)')
    expect(vars?.['--t100']).toBe('oklch(0.93 0.01 180)')
    expect(vars?.['--t300']).toBe('oklch(0.78 0.08 180)')
  })
})

describe('brandSkinVars — --pfg is a literal, not a colour', () => {
  it("emits the literal 'var(--ink)' for a light primary, resolved by the inlined tokens.css", () => {
    const vars = brandSkinVars(theme({ primary: 'oklch(0.95 0.12 100)' }))

    expect(vars?.['--pfg']).toBe('var(--ink)')
  })

  it("emits the literal 'white' for a dark primary", () => {
    const vars = brandSkinVars(theme({ primary: 'oklch(0.25 0.09 264)' }))

    expect(vars?.['--pfg']).toBe('white')
  })
})

describe('brandSkinVars — accent handling', () => {
  it('passes a parseable accent through reformatted, not raw', () => {
    const vars = brandSkinVars(theme({ accent: 'oklch(0.400000 0.2000 300.00)' }))

    expect(vars?.['--acc']).toBe('oklch(0.4 0.2 300)')
  })

  it('falls back to the guarded primary when the accent is unparseable, never emitting the raw value', () => {
    const vars = brandSkinVars(theme({ accent: '#bada55' }))

    expect(vars?.['--acc']).toBe('oklch(0.62 0.14 250)')
  })
})

describe('themeCss — an unusable primary omits the block entirely (security)', () => {
  // ColorToken is a bare z.string(), so `tokens` jsonb can legally hold any of these.
  // The strict parse is what stops them, NOT an escape pass — a value that reached the
  // output could close the declaration and inject arbitrary CSS into a customer's site.
  const UNUSABLE_PRIMARIES: Array<{ raw: string; why: string }> = [
    {
      raw: 'oklch(0.5 0.1 20); } body{display:none',
      why: 'a CSS-injection payload that would blank the whole page',
    },
    {
      raw: 'oklch(0.5 0.1 20)} </style><script>alert(1)</script>',
      why: 'a payload that would break out of <style> into script',
    },
    { raw: '#ff4b00', why: 'a hex literal, which carries no chroma to derive tints from' },
    { raw: 'rgb(255 75 0)', why: 'a foreign colour space' },
    { raw: 'oklch(62% 0.14 250)', why: 'a percentage form we never emit' },
  ]

  for (const { raw, why } of UNUSABLE_PRIMARIES) {
    it(`returns '' for a primary of ${JSON.stringify(raw)} — ${why}`, () => {
      const tokens = theme({ primary: raw })

      expect(brandSkinVars(tokens)).toBeNull()
      expect(themeCss(tokens)).toBe('')
    })
  }

  it('emits no fragment of the rejected value anywhere in the output', () => {
    const css = themeCss(theme({ primary: 'oklch(0.5 0.1 20); } body{display:none' }))

    expect(css).toBe('')
    expect(css).not.toContain('display')
    expect(css).not.toContain('}')
  })
})

describe('themeCss — output-side validation gate (amendment 2026-07-19)', () => {
  // The amendment mandates that themeCss re-validate what it is ABOUT TO EMIT, not
  // only what it read: sweep hostile tokens through the FULL pipeline and assert the
  // output never carries NaN / Infinity / undefined, nor a second `{` that would mean
  // a stored value closed the declaration and opened its own block. This holds
  // regardless of which internal path produced the value — the point of an output gate.
  const HOSTILE_VALUES: ReadonlyArray<{ raw: string; why: string }> = [
    {
      raw: `oklch(${'9'.repeat(400)} 0.1 20)`,
      why: 'a digit string that Number() overflows to Infinity in L',
    },
    { raw: `oklch(0.5 ${'9'.repeat(400)} 20)`, why: 'the same overflow in the chroma slot' },
    { raw: `oklch(0.5 0.1 ${'9'.repeat(400)})`, why: 'the same overflow in the hue slot' },
    { raw: '#ff4b00', why: 'a hex literal' },
    { raw: 'rgb(255 75 0)', why: 'a foreign colour space' },
    { raw: '', why: 'an empty string' },
    { raw: '   ', why: 'whitespace only' },
    { raw: 'oklch(０.５ ０.１ ２０)', why: 'fullwidth unicode digits the ASCII pattern rejects' },
    { raw: 'oklch(0.5 0.1 20); } body{display:none', why: 'a trailing-CSS injection payload' },
    {
      raw: 'oklch(0.5 0.1 20)} </style><script>alert(1)</script>',
      why: 'a style-breakout payload',
    },
    { raw: 'red;}</style><script>alert(1)</script>', why: 'a bare keyword plus breakout' },
  ]

  const FORBIDDEN = ['NaN', 'Infinity', 'undefined']
  // Injection markers that machine-built `oklch(L C H)` can never carry, so a safe
  // output contains NONE of them regardless of the hostile input that was fed in.
  // Their absence is what proves no raw byte leaked through into the declaration.
  const INJECTION_MARKERS = ['<', '</style', 'display', 'script', '０', '５', '9'.repeat(30)]

  const assertClean = (css: string): void => {
    for (const bad of FORBIDDEN) expect(css).not.toContain(bad)
    for (const marker of INJECTION_MARKERS) expect(css).not.toContain(marker)
    // At most one `{`/`}`: either '' (zero) or a single `:root{ … }` block.
    expect((css.match(/\{/g) ?? []).length).toBeLessThanOrEqual(1)
    expect((css.match(/\}/g) ?? []).length).toBeLessThanOrEqual(1)
  }

  for (const { raw, why } of HOSTILE_VALUES) {
    it(`emits nothing unsafe when the PRIMARY is ${JSON.stringify(raw)} — ${why}`, () => {
      assertClean(themeCss(theme({ primary: raw })))
    })

    it(`emits nothing unsafe when the ACCENT is ${JSON.stringify(raw)} — ${why}`, () => {
      // A valid primary means the block IS emitted; a hostile accent must fall back
      // to the guarded primary rather than leak its raw bytes into the declaration.
      assertClean(themeCss(theme({ accent: raw })))
    })
  }
})
