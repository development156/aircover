import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  runCreateStage: vi.fn<(cycleId: string) => Promise<unknown>>(),
}))
vi.mock('@/app/actions/loop-create', () => ({ runCreateStage: h.runCreateStage }))

import { ResumeCreate } from './resume-create'

/**
 * THE WAY BACK INTO AN APPROVED, UNFINISHED WEEK.
 *
 * Approve and create are two calls chained in the cost preview. The approval
 * revalidates the page, the preview unmounts, and the create stage's failure
 * had no element left to land in: the screen read "Running now" with nothing
 * to press, and a reload showed the same (MEASURED 2026-09-06). This panel is
 * the control that state lacked, and its error has a home.
 */

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ResumeCreate', () => {
  it('says what was approved and what is still unwritten, with the price', () => {
    render(<ResumeCreate cycleId="c1" unwritten={2} unwrittenCredits={6} written={1} />)

    expect(screen.getByRole('heading', { name: 'Approved, not yet written' })).toBeInTheDocument()
    expect(screen.getByText(/written 1 of them/)).toBeInTheDocument()
    expect(screen.getByText(/2 posts still to write/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Write this week/ })).toHaveTextContent('6')
  })

  it('offers to finish a week whose posts are all written', () => {
    render(<ResumeCreate cycleId="c1" unwritten={0} unwrittenCredits={0} written={3} />)

    expect(screen.getByText(/wrote all 3 posts/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish this week' })).toBeInTheDocument()
  })

  it('re-enters the create stage and shows its refusal in place', async () => {
    h.runCreateStage.mockResolvedValue({ ok: false, message: 'Could not reach the ledger.' })
    render(<ResumeCreate cycleId="c1" unwritten={2} unwrittenCredits={6} written={0} />)

    await userEvent.click(screen.getByRole('button', { name: /Write this week/ }))

    expect(h.runCreateStage).toHaveBeenCalledWith('c1')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the ledger.'),
    )
    // The control stays: the person can try again.
    expect(screen.getByRole('button', { name: /Write this week/ })).toBeInTheDocument()
  })

  it('reports what it wrote when the stage completes', async () => {
    h.runCreateStage.mockResolvedValue({ ok: true, created: 2, spent: 6 })
    render(<ResumeCreate cycleId="c1" unwritten={2} unwrittenCredits={6} written={0} />)

    await userEvent.click(screen.getByRole('button', { name: /Write this week/ }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Wrote 2 drafts for 6 credits.'),
    )
  })
})
