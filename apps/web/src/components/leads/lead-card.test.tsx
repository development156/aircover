import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

const { saveContact } = vi.hoisted(() => ({
  // Typed to the ACTION's return shape, not to the happy path. Inferring it
  // from `{ ok: true }` makes `message` unassignable, so the failure test — the
  // one that proves the form stays open — could not be written at all.
  saveContact: vi.fn<() => Promise<{ ok: boolean; message?: string }>>(async () => ({
    ok: true,
  })),
}))
vi.mock('@/app/actions/leads', () => ({
  setLeadStatus: vi.fn(async () => ({ ok: true })),
  updateLeadContact: saveContact,
}))

import { LeadCard } from './lead-card'
import type { LeadView } from '@/lib/leads/read'

/**
 * A LEAD CARD SHOWS A NAME AND A MARK, AND HIDES THE REST UNTIL ASKED.
 *
 * Founder's ruling, 2026-08-25. The board previously rendered the email, the
 * phone, the message and the source on every card at once, in four columns.
 *
 * ── WHY "NOT VISIBLE" IS NOT THE ASSERTION ───────────────────────────────────
 * The details are UNMOUNTED when the card is shut, and these tests assert
 * absence from the DOM rather than absence from view. A `hidden` panel would
 * satisfy a visibility check while leaving a stranger's phone number in the
 * accessible tree and in the page's text — findable by Ctrl-F, read out by a
 * screen reader, and present in any screenshot tool that walks text. On a
 * shared shop counter that is the whole difference.
 */

function lead(overrides: Partial<LeadView> = {}): LeadView {
  return {
    id: 'l1',
    name: 'Priya',
    email: 'priya@example.com',
    phone: '+91 98765 43210',
    message: 'Do you do birthday cakes?',
    status: 'new',
    readAt: null,
    createdAt: new Date().toISOString(),
    from: 'Your inbox · instagram',
    platform: 'instagram',
    ...overrides,
  }
}

function renderCard(overrides: Partial<LeadView> = {}) {
  return render(<LeadCard lead={lead(overrides)} actions={null} busy={false} />)
}

describe('the collapsed card', () => {
  test('shows the name', () => {
    renderCard()
    expect(screen.getByText('Priya')).toBeTruthy()
  })

  test('shows the platform, by its real name, to a screen reader', () => {
    renderCard()
    // The monogram is decorative. "Instagram" is the fact, and it comes from the
    // shared PLATFORM_LABELS map rather than from the raw key.
    expect(screen.getByText('Instagram')).toBeTruthy()
  })

  test('holds NOTHING else — not in view, not in the DOM', () => {
    const { container } = renderCard()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/priya@example\.com/)
    expect(text).not.toMatch(/98765/)
    expect(text).not.toMatch(/birthday cakes/)
    expect(text).not.toMatch(/Your inbox/)
  })

  test('gives a lead with no platform no mark at all', () => {
    // A site-form lead arrived on no platform. A placeholder would invent a gap
    // rather than reporting one.
    const { container } = renderCard({ platform: null, from: 'Your site' })
    expect(container.querySelector('[title]')).toBeNull()
  })

  test('says it can be opened', () => {
    renderCard()
    expect(screen.getByRole('button', { name: /Priya/ }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })
})

describe('opening the card', () => {
  function open() {
    fireEvent.click(screen.getByRole('button', { name: /Priya/ }))
  }

  test('reveals every detail that was withheld', () => {
    renderCard()
    open()
    expect(screen.getByText('priya@example.com')).toBeTruthy()
    expect(screen.getByText('+91 98765 43210')).toBeTruthy()
    expect(screen.getByText('Do you do birthday cakes?')).toBeTruthy()
    expect(screen.getByText('Your inbox · instagram')).toBeTruthy()
  })

  test('closes again, and takes the details back out of the DOM', () => {
    const { container } = renderCard()
    open()
    open()
    expect(container.textContent ?? '').not.toMatch(/priya@example\.com/)
  })

  /**
   * An absent field renders NO ROW rather than "Email —". docs/37 §4: if the
   * quantity does not exist, the slot should not exist. A dash would claim we
   * looked and found nothing, when the form never asked.
   */
  test('omits a field the lead does not have, rather than dashing it', () => {
    renderCard({ email: null, phone: null })
    open()
    expect(screen.queryByText('Email')).toBeNull()
    expect(screen.queryByText('Phone')).toBeNull()
    expect(screen.getByText('Message')).toBeTruthy()
  })
})

describe('editing the details', () => {
  function openEditor() {
    fireEvent.click(screen.getByRole('button', { name: /Priya/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
  }

  test('saves the three fields a person knows better than the row does', async () => {
    renderCard()
    openEditor()
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+91 90000 00000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() =>
      expect(saveContact).toHaveBeenCalledWith('l1', {
        name: 'Priya',
        email: 'priya@example.com',
        phone: '+91 90000 00000',
      }),
    )
  })

  /**
   * Clearing a field is a real edit and the action writes NULL for it. If the
   * form skipped blanks, removing a wrong phone number would be the one
   * correction a person could not make.
   */
  test('sends a cleared field as empty rather than dropping it', async () => {
    renderCard()
    openEditor()
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() =>
      expect(saveContact).toHaveBeenCalledWith('l1', expect.objectContaining({ phone: '' })),
    )
  })

  test('stays open on failure, still holding what was typed', async () => {
    saveContact.mockResolvedValueOnce({ ok: false, message: 'Could not save those details.' })
    renderCard()
    openEditor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Priya Sharma' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    // Closing on failure would look exactly like a save.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Could not save/))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Priya Sharma')
  })

  test('never offers to edit the message or where it came from', () => {
    // Those are records of what happened, not details a person knows better.
    // Editing either would put the lead at odds with the inbox thread beside it.
    renderCard()
    openEditor()
    expect(screen.queryByLabelText('Message')).toBeNull()
    expect(screen.queryByLabelText('Came from')).toBeNull()
  })
})
