import { describe, it, expect, vi } from 'vitest'

import { openUploadDoor, MAX_UPLOAD_BYTES } from './url-door'

/**
 * THE DECLARED TYPE IS THE CLIENT'S CLAIM.
 *
 * The image upload path proves the type by reading the bytes — `sniffImage`,
 * then `kindForProvenMime`, which refuses anything sniffing did not establish and
 * carries its own note about `image/svg+xml`. The PDF door tested the data-URL
 * prefix and nothing else, so any file wearing `data:application/pdf;base64,`
 * was forwarded to a model provider, and on escalation to a PAID OCR engine.
 *
 * A multipart part or a hand-built data URL is not a file picker: the label is
 * whatever the caller typed.
 */

const b64 = (text: string): string => Buffer.from(text, 'latin1').toString('base64')
const dataUrl = (body: string): string => `data:application/pdf;base64,${b64(body)}`

/** The door must refuse BEFORE it reaches any of these. */
const nothingShouldRun = {
  extract: vi.fn(),
  parse: vi.fn(),
  workspaceId: 'ws',
  userId: 'user',
  traceId: 'trace',
} as unknown as Parameters<typeof openUploadDoor>[2]

describe('the upload door reads the file, not the label', () => {
  it.each([
    ['a ZIP wearing a PDF label', 'PKwearing-a-pdf-label'],
    ['an SVG wearing a PDF label', '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'],
    ['an HTML page', '<!doctype html><html><body>hello there</body></html>'],
    ['an ELF binary', 'ELF and then some bytes'],
    ['plain text', 'this is definitely not a pdf at all, honestly'],
  ])('refuses %s', async (_name, body) => {
    const result = await openUploadDoor(
      { filename: 'x.pdf', dataUrl: dataUrl(body) },
      'Acme',
      nothingShouldRun,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_pdf')
  })

  it('refuses a label with no payload behind it', async () => {
    const result = await openUploadDoor(
      { filename: 'x.pdf', dataUrl: 'data:application/pdf;base64,' },
      'Acme',
      nothingShouldRun,
    )
    // RETARGETED: a bare `.ok` check passes identically whether the empty
    // payload was correctly refused as unreadable-as-a-PDF, or `openUploadDoor`
    // threw on the empty base64 body and never got near the type check at all.
    // The prefix is present but there is no magic-bytes head to sniff, so this
    // takes the SAME 'not_pdf' branch as the it.each block above — assert that,
    // and that the door never reached the reader it must stop before.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_pdf')
    expect(nothingShouldRun.extract).not.toHaveBeenCalled()
  })

  it('still accepts a real PDF past the type check', async () => {
    // THE CONTROL. Without it a check that simply returned false for everything
    // would pass every case above, which is the shape of a guard that "works" by
    // refusing the whole feature.
    //
    // The stub deliberately has no `extract.run`, so getting PAST the type check
    // throws — and that throw is the evidence. Anything answering `not_pdf`, or
    // returning cleanly, means the door stopped at the label check.
    let reachedTheReader = false
    try {
      const result = await openUploadDoor(
        { filename: 'x.pdf', dataUrl: dataUrl('%PDF-1.7\n1 0 obj\n<< >>\nendobj\n') },
        'Acme',
        nothingShouldRun,
      )
      if (!result.ok) expect(result.reason).not.toBe('not_pdf')
    } catch (error) {
      reachedTheReader = /extract/.test(String(error))
    }
    expect(reachedTheReader).toBe(true)
  })

  it('still refuses something oversized before anything reads it', async () => {
    // Built as base64 CHARACTERS rather than as bytes then encoded: the size
    // check reads the payload's length and never decodes it, and materialising
    // 8 MB of latin1 first blew the stack in this test before it blew the cap.
    const padding = 'A'.repeat(Math.ceil((MAX_UPLOAD_BYTES + 1000) * (4 / 3)))
    const huge = `data:application/pdf;base64,${b64('%PDF-1.7')}${padding}`
    const result = await openUploadDoor(
      { filename: 'x.pdf', dataUrl: huge },
      'Acme',
      nothingShouldRun,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_large')
  })
})
