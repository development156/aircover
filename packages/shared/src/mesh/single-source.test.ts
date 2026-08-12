import { describe, expect, it } from 'vitest'
import { attachProvenance, attachSingleSource } from './tasks'

/**
 * MEASURED 2026-08-12 against a real text-layer PDF: the model returned 14 good
 * fields, every one stamped `page: 1`, and `attachProvenance(fields, [filename])`
 * dropped all 14 because a one-element array has only index 0. The door then
 * told the customer their document looked like a scan.
 */
const WIRE = [
  { channel: 'source' as const, key: 'one_liner', value: 'A neighbourhood bakery.', page: 1 },
  { channel: 'voice' as const, key: 'never_use', value: 'artisanal', page: 1 },
]

describe('attachSingleSource', () => {
  it('keeps every field whatever page the model cites', () => {
    const out = attachSingleSource(WIRE, 'brandbook.pdf')
    expect(out).toHaveLength(2)
    expect(out.every((f) => f.source_url === 'brandbook.pdf')).toBe(true)
  })

  it('still cannot be told a field is confirmed', () => {
    expect(attachSingleSource(WIRE, 'x.pdf').every((f) => f.confirmed === false)).toBe(true)
  })

  it('is not fooled by a page index of 0 either', () => {
    const out = attachSingleSource([{ ...WIRE[0]!, page: 0 }], 'x.pdf')
    expect(out).toHaveLength(1)
  })

  it('THE BUG: attachProvenance drops these, which is why uploads need this', () => {
    // Kept as the counter-example. attachProvenance is still right for a CRAWL,
    // where blocks are labelled index=0,1,2 and a made-up index is an invention.
    expect(attachProvenance(WIRE, ['brandbook.pdf'])).toHaveLength(0)
  })

  it('attachProvenance still resolves a real multi-block citation', () => {
    expect(attachProvenance(WIRE, ['page-a', 'page-b'])).toHaveLength(2)
  })
})
