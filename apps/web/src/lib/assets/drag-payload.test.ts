import { describe, expect, it } from 'vitest'

import { decodeAssetDrag, encodeAssetDrag, idsForDrag, isAssetDrag } from './drag-payload'
import { ASSET_DRAG_MIME } from './drag-payload'

describe('idsForDrag: what a drag actually moves', () => {
  it('dragging a SELECTED file moves the whole selection', () => {
    const selected = new Set(['a', 'b', 'c'])
    expect(idsForDrag('b', selected).sort()).toEqual(['a', 'b', 'c'])
  })

  it('dragging an UNSELECTED file moves only that file', () => {
    // The half that is easy to get wrong. A person who reaches past their
    // selection for a different photo has said unambiguously which they meant,
    // and filing the other forty would be an action they never asked for.
    const selected = new Set(['a', 'b', 'c'])
    expect(idsForDrag('z', selected)).toEqual(['z'])
  })

  it('with nothing selected it moves the dragged file', () => {
    expect(idsForDrag('a', new Set())).toEqual(['a'])
  })

  it('does not mutate or read through the selection it was given', () => {
    const selected = new Set(['a'])
    const result = idsForDrag('a', selected)
    result.push('injected')
    expect([...selected]).toEqual(['a'])
  })
})

describe('the payload round-trips', () => {
  it('encode then decode gives the same ids', () => {
    expect(decodeAssetDrag(encodeAssetDrag(['a', 'b']))).toEqual(['a', 'b'])
  })
})

// ── A DataTransfer IS UNTRUSTED INPUT ───────────────────────────────────────
describe('decodeAssetDrag never throws, whatever it is handed', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['not JSON', 'not json at all'],
    ['a JSON object', '{"ids":["a"]}'],
    ['a JSON string', '"a"'],
    ['a JSON number', '7'],
    ['null literal', 'null'],
  ])('returns [] for %s', (_label, input) => {
    expect(decodeAssetDrag(input as string | null | undefined)).toEqual([])
  })

  it('keeps the good entries in a partly bad array rather than dropping all of them', () => {
    // A drop that carried three real ids and one number is still a real drag of
    // three files. Refusing the lot would lose work over a value nothing was
    // going to use.
    expect(decodeAssetDrag('["a", 7, "b", null, ""]')).toEqual(['a', 'b'])
  })
})

describe('isAssetDrag reads the TYPES, because the data is unreadable on dragover', () => {
  it('recognises our own type', () => {
    expect(isAssetDrag([ASSET_DRAG_MIME])).toBe(true)
    expect(isAssetDrag(['text/plain', ASSET_DRAG_MIME])).toBe(true)
  })

  it('refuses a plain-text drag and a desktop file drop', () => {
    // Both would otherwise land as a filing of nothing: text dragged from
    // another page, and an upload the person meant for the uploader.
    expect(isAssetDrag(['text/plain'])).toBe(false)
    expect(isAssetDrag(['Files'])).toBe(false)
    expect(isAssetDrag([])).toBe(false)
    expect(isAssetDrag(undefined)).toBe(false)
  })

  it('the MIME type is not text/plain, and that is load-bearing', () => {
    // If this ever becomes text/plain, every drag out of the library becomes
    // droppable into any text field on the page as raw JSON.
    expect(ASSET_DRAG_MIME).not.toBe('text/plain')
    expect(ASSET_DRAG_MIME).toMatch(/^application\//)
  })
})
