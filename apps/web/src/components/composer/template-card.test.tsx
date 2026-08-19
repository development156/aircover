import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { TemplateCard } from './template-card'
import type { TemplatesRead } from '@/lib/templates/read'

/**
 * The template card, and the one rule it exists to keep.
 *
 * ── A COUNT IS A CLAIM ABOUT THE CUSTOMER'S LIBRARY ─────────────────────────
 * The reference card says "14 templates matched to your industry". A number there
 * says the library was read and holds that many. So it may appear on exactly one
 * of the three reads, and the other two must not be dressed as small versions of
 * it: a failed read showing `0` says "you have none" about a question nobody
 * managed to ask, and an empty library showing `0 templates` reports a
 * measurement where nothing was measured.
 */

const calls = vi.hoisted(() => ({ saved: [] as unknown[] }))
vi.mock('@/app/actions/templates', () => ({
  saveTemplate: (...args: unknown[]) => {
    calls.saved.push(args)
    return Promise.resolve({ ok: true, templateId: 't1' })
  },
}))

const ok = (n: number): TemplatesRead => ({
  status: 'ok',
  templates: Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Template ${i}`,
    channel: null,
    body: `body ${i}`,
  })),
})

beforeEach(() => {
  calls.saved = []
})

describe('what the card is allowed to say', () => {
  test('shows the count when the library was actually read', () => {
    render(<TemplateCard read={ok(3)} body="" channel={null} onUse={() => {}} />)
    expect(screen.getByText('3 saved')).toBeVisible()
  })

  test('shows NO number when the read failed', () => {
    render(<TemplateCard read={{ status: 'unreadable' }} body="" channel={null} onUse={() => {}} />)

    expect(screen.getByText(/could not read your templates/i)).toBeVisible()
    expect(screen.queryByText(/\bsaved\b/i)).toBeNull()
    // The specific lie this forbids.
    expect(screen.queryByText(/^0 /)).toBeNull()
    expect(screen.queryByText(/nothing saved yet/i)).toBeNull()
  })

  test('shows an empty STATE rather than a zero when there are none', () => {
    render(<TemplateCard read={ok(0)} body="" channel={null} onUse={() => {}} />)

    expect(screen.getByText(/nothing saved yet/i)).toBeVisible()
    expect(screen.queryByText(/0 saved/)).toBeNull()
  })

  test('tells an account with no workspace what is actually true, with no retry', () => {
    render(
      <TemplateCard read={{ status: 'no-workspace' }} body="" channel={null} onUse={() => {}} />,
    )
    expect(screen.getByText(/belong to a workspace/i)).toBeVisible()
    // Reloading cannot make a workspace, so no remedy is offered.
    expect(screen.queryByText(/reload/i)).toBeNull()
  })
})

describe('using and saving', () => {
  test('hands the template’s words to the caller, and writes nothing itself', async () => {
    const onUse = vi.fn()
    const user = userEvent.setup()
    render(<TemplateCard read={ok(2)} body="" channel={null} onUse={onUse} />)

    await user.click(screen.getByText('Template 1'))

    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ body: 'body 1' }))
    expect(calls.saved).toEqual([])
  })

  test('offers saving only when there is something to save', () => {
    const { rerender } = render(
      <TemplateCard read={ok(0)} body="   " channel={null} onUse={() => {}} />,
    )
    // A template of an empty box is not a starting point.
    expect(document.querySelector('[data-template-save]')).toBeNull()

    rerender(<TemplateCard read={ok(0)} body="Fresh chai" channel={null} onUse={() => {}} />)
    expect(document.querySelector('[data-template-save]')).not.toBeNull()
  })

  test('will not save without a name', async () => {
    const user = userEvent.setup()
    render(<TemplateCard read={ok(0)} body="Fresh chai" channel="x" onUse={() => {}} />)

    await user.click(document.querySelector('[data-template-save]') as Element)
    expect(screen.getByRole('button', { name: /save template/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/template name/i), 'Friday offer')
    await user.click(screen.getByRole('button', { name: /save template/i }))

    expect(calls.saved).toEqual([['Friday offer', 'Fresh chai', 'x']])
    // Named back, so a writer with several can tell which one landed.
    expect(await screen.findByText(/Saved as “Friday offer”/)).toBeVisible()
  })
})
