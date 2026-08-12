import { describe, expect, it } from 'vitest'

import { declaredColors, htmlToText, pageTitle } from './site-text'

describe('htmlToText', () => {
  it('drops script and style bodies', () => {
    const html = `
      <html><head><style>.a{color:#ff0000}</style><script>var x = "hello"</script></head>
      <body><p>We bake sourdough.</p></body></html>`

    const text = htmlToText(html)

    expect(text).toContain('We bake sourdough.')
    expect(text).not.toContain('color')
    expect(text).not.toContain('var x')
  })

  it('drops the body of an unclosed script', () => {
    // A truncated fetch can end mid-script; without the unclosed-tag rule the
    // whole tail of the file arrives as if it were prose.
    const text = htmlToText('<p>Real copy.</p><script>var secret = "junk junk junk"')

    expect(text).toContain('Real copy.')
    expect(text).not.toContain('junk')
  })

  it('does not run block elements together', () => {
    const text = htmlToText('<li>Sourdough</li><li>Pav</li>')

    expect(text).not.toContain('SourdoughPav')
    expect(text.split('\n').map((line) => line.trim())).toContain('Sourdough')
  })

  it('decodes named, decimal and hex entities', () => {
    const text = htmlToText('<p>Tea &amp; cake &#8212; &#x63;heap</p>')

    expect(text).toContain('Tea & cake')
    expect(text).toContain('cheap')
  })

  it('leaves an entity it does not know rather than mangling it', () => {
    expect(htmlToText('<p>&notareal;</p>')).toContain('&notareal;')
  })

  it('strips comments', () => {
    expect(htmlToText('<p>Copy</p><!-- TODO: rewrite this -->')).not.toContain('TODO')
  })
})

describe('pageTitle', () => {
  it('reads the title', () => {
    expect(pageTitle('<title>Rolling Pin Bakehouse</title>')).toBe('Rolling Pin Bakehouse')
  })

  it('decodes and collapses it', () => {
    expect(pageTitle('<title>Tea &amp;\n  Cake</title>')).toBe('Tea & Cake')
  })

  it('is empty when there is no title', () => {
    expect(pageTitle('<p>no head here</p>')).toBe('')
  })
})

describe('declaredColors', () => {
  it('takes theme-color above anything counted', () => {
    const html = `
      <meta name="theme-color" content="#1d7a4c">
      <style>${'.x{color:#c0392b}'.repeat(20)}</style>`

    const colors = declaredColors(html)

    expect(colors.length).toBeGreaterThan(0)
    // oklch strings, ready for brandSkinVars — not hex.
    expect(colors[0]).toMatch(/^oklch\(/)
    // The green is the declaration; the repeated red is only the most common.
    const [lightness, chroma, hue] = colors[0]!
      .replace(/oklch\(|\)/g, '')
      .split(' ')
      .map(Number)
    expect(hue).toBeGreaterThan(120)
    expect(hue).toBeLessThan(180)
    expect(chroma).toBeGreaterThan(0)
    expect(lightness).toBeGreaterThan(0)
  })

  it('falls back to the most repeated brand colour', () => {
    const html = `<style>${'.x{color:#c0392b}'.repeat(10)} .y{color:#123456}</style>`

    expect(declaredColors(html)[0]).toMatch(/^oklch\(/)
  })

  it('ignores greys, near-white and near-black', () => {
    // Page furniture on every site ever built. Taking one would repaint the
    // whole workspace in a theme's default grey.
    const html = `<style>${'.x{color:#ffffff;background:#000000;border:#cccccc}'.repeat(30)}</style>`

    expect(declaredColors(html)).toEqual([])
  })

  it('reads rgb() as well as hex', () => {
    const html = `<style>${'.x{color:rgb(192, 57, 43)}'.repeat(5)}</style>`

    expect(declaredColors(html).length).toBe(1)
  })

  it('expands three-digit hex', () => {
    const html = `<style>${'.x{color:#f00}'.repeat(5)}</style>`

    expect(declaredColors(html).length).toBe(1)
  })

  it('returns nothing rather than something wrong', () => {
    // No colour is a first-class answer — activeThemeTokens() already treats
    // null as "use the defaults".
    expect(declaredColors('<p>plain page</p>')).toEqual([])
    expect(declaredColors('')).toEqual([])
  })

  it('never returns more than a primary and an accent', () => {
    const html = Array.from(
      { length: 50 },
      (_, i) => `.c${i}{color:#${(0x2255aa + i * 0x040404).toString(16).padStart(6, '0')}}`,
    ).join('')

    expect(declaredColors(html).length).toBeLessThanOrEqual(2)
  })
})
