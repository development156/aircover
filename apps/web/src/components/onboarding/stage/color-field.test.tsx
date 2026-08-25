import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'

import { ColorField } from './color-field'

/**
 * The two things the founder asked for, on 25 August: a place to paste a brand
 * hex, and a picker that is not the operating system's dialog.
 */

function open(label = 'Primary') {
  return screen.getByRole('button', { name: new RegExp(`^${label} colour`) })
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).EyeDropper
})

describe('ColorField', () => {
  test('a pasted hex reaches the store, with or without the hash', async () => {
    const onChange = vi.fn()
    render(<ColorField label="Primary" value="#FF6600" onChange={onChange} />)
    await userEvent.click(open())

    const field = screen.getByRole('textbox', { name: /Primary hex code/ })
    await userEvent.clear(field)
    await userEvent.paste('0068d6')

    // Normalised on the way in: one shape reaches the store, because a
    // mixed-case duplicate would look like two different colours.
    expect(onChange).toHaveBeenLastCalledWith('#0068D6')
  })

  test('a half-typed hex changes nothing rather than snapping to a colour', async () => {
    const onChange = vi.fn()
    render(<ColorField label="Primary" value="#FF6600" onChange={onChange} />)
    await userEvent.click(open())

    const field = screen.getByRole('textbox', { name: /Primary hex code/ })
    await userEvent.clear(field)
    await userEvent.type(field, '00')

    expect(onChange).not.toHaveBeenCalled()
  })

  test('picking a swatch sets that exact colour', async () => {
    const onChange = vi.fn()
    render(<ColorField label="Primary" value="#FF6600" onChange={onChange} />)
    await userEvent.click(open())

    await userEvent.click(screen.getByRole('button', { name: '#FFFFFF' }))

    expect(onChange).toHaveBeenCalledWith('#FFFFFF')
  })

  test('the grid is on screen without opening an operating system dialog', async () => {
    render(<ColorField label="Primary" value="#FF6600" onChange={vi.fn()} />)
    await userEvent.click(open())

    // 7 neutrals + 5 rows of 11. The native input is still present as the
    // labelled escape hatch and is NOT what a person meets first.
    expect(screen.getAllByRole('button', { name: /^#[0-9A-F]{6}$/ })).toHaveLength(62)
    expect(screen.getByLabelText(/full spectrum/i)).toBeInTheDocument()
  })

  test('marks the current colour, so the grid shows where you are', async () => {
    render(<ColorField label="Primary" value="#FFFFFF" onChange={vi.fn()} />)
    await userEvent.click(open())

    expect(screen.getByRole('button', { name: '#FFFFFF' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('offers the eyedropper only where it exists', async () => {
    // A button that opens nothing on Safari and Firefox is a remedy that cannot
    // work, which this codebase has a spec named after.
    render(<ColorField label="Primary" value="#FF6600" onChange={vi.fn()} />)
    await userEvent.click(open())
    expect(screen.queryByRole('button', { name: /pick a colour from the screen/i })).toBeNull()
  })

  test('samples a colour when the browser can', async () => {
    const openDropper = vi.fn().mockResolvedValue({ sRGBHex: '#0068d6' })
    ;(window as unknown as Record<string, unknown>).EyeDropper = class {
      open = openDropper
    }
    const onChange = vi.fn()
    render(<ColorField label="Primary" value="#FF6600" onChange={onChange} />)
    await userEvent.click(open())

    await userEvent.click(screen.getByRole('button', { name: /pick a colour from the screen/i }))

    expect(openDropper).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith('#0068D6')
  })

  test('a cancelled sample changes nothing and reports nothing', async () => {
    ;(window as unknown as Record<string, unknown>).EyeDropper = class {
      open = vi.fn().mockRejectedValue(new Error('AbortError'))
    }
    const onChange = vi.fn()
    render(<ColorField label="Primary" value="#FF6600" onChange={onChange} />)
    await userEvent.click(open())
    await userEvent.click(screen.getByRole('button', { name: /pick a colour from the screen/i }))

    // Pressing Escape in the eyedropper is not an error and has no message.
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('Escape closes the picker instead of leaving the flow', async () => {
    render(<ColorField label="Primary" value="#FF6600" onChange={vi.fn()} />)
    await userEvent.click(open())
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
