import { describe, expect, it } from 'vitest'

import { SAMPLE_REPORT } from './sample-report'

import { PLAIN_TEXT_LIMIT, toPlainText } from './plain-text'

describe('toPlainText', () => {
  it('fits in one message and carries the four things that matter', () => {
    const text = toPlainText(SAMPLE_REPORT)
    expect(text.length).toBeLessThanOrEqual(PLAIN_TEXT_LIMIT)
    expect(text).toContain('A good week.')
    expect(text).toContain('People reached: 1,240')
    expect(text).toContain('Moved next week')
    expect(text).toContain('One enquiry is waiting')
  })

  it('carries no markdown, because WhatsApp renders none', () => {
    expect(toPlainText(SAMPLE_REPORT)).not.toMatch(/[*_#`|]/)
  })

  it('drops from the bottom rather than overflowing', () => {
    const long = {
      ...SAMPLE_REPORT,
      changed: ['x'.repeat(400), 'y'.repeat(400), 'z'.repeat(400)],
    }
    const text = toPlainText(long)
    expect(text.length).toBeLessThanOrEqual(PLAIN_TEXT_LIMIT)
    // The verdict survives the cut. It is the sentence the message exists for.
    expect(text).toContain('A good week.')
  })

  it('says plainly when a number could not be read, instead of printing a zero', () => {
    const text = toPlainText({
      ...SAMPLE_REPORT,
      numbers: { ...SAMPLE_REPORT.numbers, replies: { status: 'unreadable' } },
    })
    expect(text).toContain('People who replied: I could not read this one just now')
  })
})
