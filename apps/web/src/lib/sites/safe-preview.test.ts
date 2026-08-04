import { afterEach, describe, expect, test, vi } from 'vitest'

import { renderPreviewSafely } from './safe-preview'

/**
 * A charged site whose preview throws must not take the whole page down.
 *
 * Live on 2026-07-20: the first real 100-credit `site_generate` succeeded, the
 * rows landed, and /sites then returned HTTP 500 — the founder paid and got a
 * dead screen with no way to see or retry anything. `renderBundle` throws BY
 * DESIGN (the <style>-closer guard) and `sharedTokensCss` does file I/O, yet
 * `buildPreview` called both bare while every other read in that module
 * degrades to null/empty. This is the missing seam.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

describe('renderPreviewSafely', () => {
  test('returns the render result when it succeeds', () => {
    const result = renderPreviewSafely('site-1', () => 'rendered')

    expect(result).toBe('rendered')
  })

  test('returns null instead of propagating a throw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = renderPreviewSafely('site-1', () => {
      throw new Error('renderDocument: the injected tokensCss closes the <style> block')
    })

    expect(result).toBeNull()
  })

  test('logs the real cause server-side so the failure is diagnosable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderPreviewSafely('site-abc', () => {
      throw new Error('ENOENT: no such file or directory')
    })

    const line = spy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(line).toContain('site-abc')
    expect(line).toContain('ENOENT')
  })

  test('survives a non-Error throw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() =>
      renderPreviewSafely('s', () => {
        throw 'a bare string'
      }),
    ).not.toThrow()
  })

  test('a logging failure never changes the outcome', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('logger died')
    })

    expect(() =>
      renderPreviewSafely('s', () => {
        throw new Error('boom')
      }),
    ).not.toThrow()
  })
})
