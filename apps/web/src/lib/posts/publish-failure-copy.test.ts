import { describe, expect, test } from 'vitest'

import { publishFailureMessage } from './publish-failure-copy'

const RAW = 'createPost: HTTP 500 <html><body>Bad gateway</body></html>'

describe('publishFailureMessage', () => {
  test('a message the job marked unreadable is replaced by the code’s copy, whatever it says', () => {
    const out = publishFailureMessage({
      code: 'PLATFORM_REJECTED',
      message: RAW,
      customerReadable: false,
    })

    expect(out).not.toContain('createPost')
    expect(out).not.toContain('HTTP')
    expect(out).not.toContain('<html>')
    expect(out).toMatch(/refused this post/i)
  })

  test('an unknown code still says nothing the adapter said', () => {
    const out = publishFailureMessage({
      code: 'ZERNIO_WEIRD',
      message: RAW,
      customerReadable: false,
    })

    expect(out).not.toContain('createPost')
    expect(out).toMatch(/try again/i)
  })

  test('a readable sentence keeps its figures and gets its channel label', () => {
    // The engine leads with the channel KEY. Rule 4: the reader gets "X", not "x".
    const out = publishFailureMessage({
      code: 'MAX_CHARS',
      message: 'x allows 280 characters; this has 312.',
      customerReadable: true,
    })

    expect(out).toBe('X allows 280 characters; this has 312.')
  })

  test('a readable sentence with no leading key is returned as written', () => {
    const message =
      'This workspace has used all 100 of its X posts for this month. X charges Sahoda for every post, so the rest are held until the month turns. nothing was sent and nothing was charged. Other channels are unaffected.'
    const out = publishFailureMessage({
      code: 'X_RATION_EXHAUSTED',
      message,
      customerReadable: true,
    })

    expect(out).toBe(message)
  })

  test('the flag is the whole decision: the same code is mapped or kept by it alone', () => {
    // MEDIA_REQUIRED comes from the engine AND from the adapter. Only the job
    // knows which, and this function must not guess from the words.
    const kept = publishFailureMessage({
      code: 'MEDIA_REQUIRED',
      message: 'instagram needs at least one photo.',
      customerReadable: true,
    })
    const mapped = publishFailureMessage({
      code: 'MEDIA_REQUIRED',
      message: 'instagram needs at least one photo.',
      customerReadable: false,
    })

    expect(kept).toBe('Instagram needs at least one photo.')
    expect(mapped).toBe('Instagram needs at least one photo. There is no text-only post.')
  })
})
