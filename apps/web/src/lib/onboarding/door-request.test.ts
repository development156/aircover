import { describe, expect, it, vi } from 'vitest'

import { MAX_PDF_BYTES } from './door'
import { bodyTooLarge, MAX_DOOR_BODY_BYTES, MAX_URL_CHARS, parseDoorForm } from './door-request'

describe('bodyTooLarge', () => {
  it('refuses a declared body over the cap, and nothing else', () => {
    expect(bodyTooLarge(String(MAX_DOOR_BODY_BYTES + 1))).toBe(true)
    expect(bodyTooLarge(String(MAX_DOOR_BODY_BYTES))).toBe(false)
    expect(bodyTooLarge(null)).toBe(false)
    expect(bodyTooLarge('not a number')).toBe(false)
  })

  it('the cap leaves room for a PDF exactly at the PDF cap', () => {
    expect(MAX_DOOR_BODY_BYTES).toBeGreaterThan(MAX_PDF_BYTES)
  })
})

describe('parseDoorForm', () => {
  it('reads the two text fields and describes the PDF without copying it', () => {
    const form = new FormData()
    form.set('url', 'acme.com')
    form.set('sentence', '')
    const file = new File([new Uint8Array(12)], 'deck.pdf', { type: 'application/pdf' })
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer')
    form.set('pdf', file)

    const read = parseDoorForm(form)

    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.url).toBe('acme.com')
    expect(read.pdf).toMatchObject({ name: 'deck.pdf', size: 12 })
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('an empty file is no file', () => {
    const form = new FormData()
    form.set('pdf', new File([], 'empty.pdf'))
    const read = parseDoorForm(form)
    expect(read.ok && read.pdf).toBeNull()
  })

  it('a file sent under a text key is an empty string, not "[object File]"', () => {
    const form = new FormData()
    form.set('url', new File([new Uint8Array(1)], 'x'))
    const read = parseDoorForm(form)
    expect(read.ok && read.url).toBe('')
  })

  it('refuses a link longer than the cap as input', () => {
    const form = new FormData()
    form.set('url', `https://acme.com/${'a'.repeat(MAX_URL_CHARS)}`)
    expect(parseDoorForm(form)).toEqual({ ok: false, reason: 'invalid_input' })
  })

  it('caps the filename that is read back to the customer', () => {
    const form = new FormData()
    form.set('pdf', new File([new Uint8Array(1)], 'x'.repeat(500)))
    const read = parseDoorForm(form)
    expect(read.ok && read.pdf?.name.length).toBe(200)
  })
})
