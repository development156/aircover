import { describe, expect, it } from 'vitest'

import { duplicateMessage } from './duplicate-copy'

describe('the live case', () => {
  it('names the file and says nothing was added', () => {
    const message = duplicateMessage('Shopfront at dusk.jpg', null)
    expect(message).toMatch(/Shopfront at dusk\.jpg/)
    expect(message).toMatch(/not added again/)
  })

  // ── THE CLAIM THE MECHANISM CANNOT SUPPORT ────────────────────────────────
  it('says "file", never "photo" or "image"', () => {
    // The check is a hash of the exact bytes. Two visually identical photos
    // saved at different quality hash differently, so "the same photo" would
    // tell a person Sahoda looked at the picture. It looked at the bytes.
    for (const deletedAt of [null, '2026-08-26T00:00:00.000Z']) {
      const message = duplicateMessage('a.jpg', deletedAt)
      expect(message).toMatch(/\bfile\b/)
      expect(message).not.toMatch(/\bphoto\b(?! )/)
      expect(message).not.toMatch(/same (photo|image|picture)/i)
    }
  })
})

describe('the trashed case is a different situation, not a variant of the same one', () => {
  it('points at the trash and at Restore, and does NOT say "you already have this"', () => {
    // They deleted it. "You already have this" is wrong, and uploading a second
    // copy would leave two rows and two objects in storage for one file.
    const message = duplicateMessage('Shopfront.jpg', '2026-08-26T00:00:00.000Z')
    expect(message).toMatch(/in your trash/)
    expect(message).toMatch(/Restore/)
    expect(message).not.toMatch(/already have/)
  })

  it('the two cases never produce the same sentence', () => {
    expect(duplicateMessage('a.jpg', null)).not.toBe(
      duplicateMessage('a.jpg', '2026-08-26T00:00:00.000Z'),
    )
  })
})

describe('a file with no title is described, never given its id', () => {
  it.each([null, '', '   '])('%p reads as an untitled photo', (title) => {
    const message = duplicateMessage(title, null)
    expect(message).toMatch(/an untitled photo/)
  })

  it('a real title is trimmed rather than printed with its whitespace', () => {
    expect(duplicateMessage('  Shopfront.jpg  ', null)).toMatch(/: Shopfront\.jpg\./)
  })
})
