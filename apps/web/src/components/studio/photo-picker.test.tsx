import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { PhotoPicker } from './photo-picker'
import type { PhotoListRead } from '@/lib/studio/read'

/**
 * FOUR NOTHINGS, AND THE PICKER MAY NEVER CONFLATE THEM.
 *
 * "your library has no pictures", "we could not read your library" and "this
 * account is in no workspace" are three different situations, and the first two
 * are the pair that gets merged by accident. Telling somebody their library is
 * empty when the read failed sends them to upload photos they already have,
 * which `no-impossible-remedy.spec.ts` forbids across the product.
 *
 * These assert the CLAIM through lowercase substrings, never the wording, so
 * every sentence in the component can be rewritten without touching this file.
 */

function open(read: PhotoListRead, chosen: string | null = null) {
  const onChoose = vi.fn()
  const onClear = vi.fn()
  render(
    <PhotoPicker read={read} chosen={chosen} onChoose={onChoose} onClear={onClear} busy={false} />,
  )
  fireEvent.click(screen.getByRole('button', { name: /picture/i }))
  return { onChoose, onClear }
}

describe('the photo picker', () => {
  test('an empty library says so, and offers the one remedy that works', () => {
    open({ status: 'ok', photos: [] })
    expect(screen.getByText(/no pictures in your library/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /add/i }).getAttribute('href')).toBe('/assets')
  })

  /** THE ONE THAT MATTERS. A failed read is not an empty library. */
  test('a failed read never claims the library is empty', () => {
    open({ status: 'unreadable' })
    const alert = screen.getByRole('alert')
    expect(alert.textContent ?? '').toMatch(/could not read/i)
    expect(alert.textContent ?? '').not.toMatch(/no pictures/i)
  })

  test('an account with no workspace is told that, not that it has no pictures', () => {
    open({ status: 'no-workspace' })
    expect(screen.getByText(/not in one/i)).toBeTruthy()
    expect(screen.queryByText(/no pictures/i)).toBeNull()
    // Nothing to upload to, so no link that cannot help.
    expect(screen.queryByRole('link', { name: /add/i })).toBeNull()
  })

  test('choosing a picture hands back its id', () => {
    const { onChoose } = open({
      status: 'ok',
      photos: [{ id: 'photo-1', title: 'Samosas', url: 'https://example.test/1' }],
    })
    fireEvent.click(screen.getByRole('button', { name: /samosas/i }))
    expect(onChoose).toHaveBeenCalledWith('photo-1')
  })

  /**
   * A picture whose signed URL failed is STILL usable: the renderer reads
   * bytes, not this address. Dropping it would hide a working photo over a
   * missing thumbnail.
   */
  test('a picture with no preview is still listed and still choosable', () => {
    const { onChoose } = open({
      status: 'ok',
      photos: [{ id: 'photo-2', title: 'Samosas', url: null }],
    })
    expect(screen.getByText(/no preview/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /no preview/i }))
    expect(onChoose).toHaveBeenCalledWith('photo-2')
  })

  test('a slot holding a picture offers to remove it, and an empty one does not', () => {
    const { onClear } = open(
      { status: 'ok', photos: [{ id: 'photo-1', title: 'Samosas', url: null }] },
      'photo-1',
    )
    fireEvent.click(screen.getByRole('button', { name: /remove it/i }))
    expect(onClear).toHaveBeenCalled()
  })

  test('an empty slot has nothing to remove', () => {
    render(
      <PhotoPicker
        read={{ status: 'ok', photos: [] }}
        chosen={null}
        onChoose={vi.fn()}
        onClear={vi.fn()}
        busy={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /remove it/i })).toBeNull()
  })

  /**
   * A design can reference a picture that is not in the first sixty, or one
   * that has since been trashed. The slot still holds it, so the picker says a
   * picture is chosen rather than inventing a name for it.
   */
  test('a chosen picture the list does not carry is reported as chosen, not as named', () => {
    render(
      <PhotoPicker
        read={{ status: 'ok', photos: [] }}
        chosen="not-in-this-list"
        onChoose={vi.fn()}
        onClear={vi.fn()}
        busy={false}
      />,
    )
    expect(screen.getByText(/a picture from your library/i)).toBeTruthy()
  })
})
