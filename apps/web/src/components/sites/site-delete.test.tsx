import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SiteDelete } from './site-delete'

const deleteSite = vi.fn()
const refresh = vi.fn()

vi.mock('@/app/actions/site-delete', () => ({
  deleteSite: (...args: unknown[]) => deleteSite(...args),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

/**
 * THE WAY OUT OF A WEBSITE SOMEBODY DID NOT WANT.
 *
 * With the plan allowance counting drafts and no delete anywhere in the product,
 * a Starter customer's first generation was also their last. These guard the two
 * properties that make a destructive control safe to press: it asks first, and
 * it says what is actually lost BEFORE the press rather than after it.
 *
 * The fear a person actually has here is losing the enquiries that came through
 * the site. Those survive — leads keep their rows with `site_id` set null — and
 * saying so is why somebody presses at all instead of keeping a site they do not
 * want because they are unsure what goes with it.
 */
beforeEach(() => {
  vi.clearAllMocks()
  deleteSite.mockResolvedValue({ ok: true })
  // `<dialog>` is not implemented in jsdom and `Modal` calls only these two.
  // Same stub `shortcut-sheet.test.tsx` uses, for the same reason.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
})

describe('deleting a website', () => {
  it('never deletes on the first press', async () => {
    render(<SiteDelete siteId="site-1" siteName="Chai Point" />)

    await userEvent.click(screen.getByRole('button', { name: /delete this website/i }))

    expect(deleteSite).not.toHaveBeenCalled()
  })

  it('names the site and says the loss is permanent, before the press', async () => {
    render(<SiteDelete siteId="site-1" siteName="Chai Point" />)

    await userEvent.click(screen.getByRole('button', { name: /delete this website/i }))

    const said = document.body.textContent ?? ''
    expect(said).toMatch(/Chai Point/)
    expect(said).toMatch(/cannot bring it back/i)
    // The cost of undoing it by hand, stated rather than discovered.
    expect(said).toMatch(/costs credits/i)
  })

  /**
   * The two facts that decide whether somebody presses. Both are claims this
   * code can back: leads survive with a null `site_id`, and the allowance counts
   * rows, so removing one frees the slot.
   */
  it('says what SURVIVES, not only what goes', async () => {
    render(<SiteDelete siteId="site-1" siteName="Chai Point" />)

    await userEvent.click(screen.getByRole('button', { name: /delete this website/i }))

    const said = document.body.textContent ?? ''
    expect(said).toMatch(/enquiries people already sent you are kept/i)
    expect(said).toMatch(/frees the website slot/i)
  })

  it('deletes the site it was given, once confirmed', async () => {
    render(<SiteDelete siteId="site-1" siteName="Chai Point" />)

    await userEvent.click(screen.getByRole('button', { name: /delete this website/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete it for good/i }))

    expect(deleteSite).toHaveBeenCalledWith('site-1')
    expect(refresh).toHaveBeenCalled()
  })

  it('keeps it when the way out is taken, and deletes nothing', async () => {
    render(<SiteDelete siteId="site-1" siteName="Chai Point" />)

    await userEvent.click(screen.getByRole('button', { name: /delete this website/i }))
    await userEvent.click(screen.getByRole('button', { name: /keep it/i }))

    expect(deleteSite).not.toHaveBeenCalled()
  })

  /**
   * A refusal has to be READABLE. Closing the dialog on failure would leave the
   * sentence nowhere, and the site is still there either way.
   */
  it('shows a refusal instead of closing, and does not claim it was deleted', async () => {
    deleteSite.mockResolvedValue({ ok: false, message: 'That website is not in your workspace.' })
    render(<SiteDelete siteId="site-1" siteName="Chai Point" />)

    await userEvent.click(screen.getByRole('button', { name: /delete this website/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete it for good/i }))

    expect(screen.getByRole('alert').textContent ?? '').toMatch(/not in your workspace/i)
    expect(refresh).not.toHaveBeenCalled()
    // Still open, so the person can read it and try again or back out.
    expect(screen.getByRole('button', { name: /keep it/i })).toBeInTheDocument()
  })
})
