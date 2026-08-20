import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { ApproveButton } from './approve-button'

const state = vi.hoisted(() => ({
  result: { ok: true, status: 'approved' } as
    { ok: true; status: string } | { ok: false; message: string },
  calls: [] as string[],
  toasts: { success: [] as unknown[], error: [] as unknown[] },
}))

vi.mock('@/app/actions/planner', () => ({
  approvePost: (postId: string) => {
    state.calls.push(postId)
    return Promise.resolve(state.result)
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: (message: unknown) => state.toasts.success.push(message),
    error: (message: unknown) => state.toasts.error.push(message),
  },
}))

const POST_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  state.result = { ok: true, status: 'approved' }
  state.calls = []
  state.toasts = { success: [], error: [] }
})

describe('ApproveButton', () => {
  test('a draft can be approved with one click', async () => {
    render(<ApproveButton postId={POST_ID} status="draft" />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(state.calls).toEqual([POST_ID])
    expect(state.toasts.success).toHaveLength(1)
  })

  test('an approved post offers no control at all, not a disabled one', () => {
    const { container } = render(<ApproveButton postId={POST_ID} status="approved" />)

    // This used to assert a DISABLED button named "Approved", under a test name
    // that already said what it should have been: "state, not a live control".
    // A disabled button is still a control — a screen reader announces it, the
    // reader takes the action, and nothing happens (docs/26 §10.2). The old
    // assertion contradicted its own title.
    //
    // It was also the word twice: the /planner row renders "Approved" in its
    // status chip AND rendered it again in the dead button beside it. The chip
    // is the state, so there is nothing left here to say.
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('pipeline-owned statuses render no approve affordance at all', () => {
    const { container } = render(<ApproveButton postId={POST_ID} status="published" />)

    expect(container).toBeEmptyDOMElement()
  })

  test('a refusal surfaces the action message', async () => {
    state.result = { ok: false, message: "Can't approve this post from its current state." }

    render(<ApproveButton postId={POST_ID} status="review" />)
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(state.toasts.error).toEqual(["Can't approve this post from its current state."])
  })

  test('carries the seeded tour anchor', () => {
    render(<ApproveButton postId={POST_ID} status="draft" />)

    expect(screen.getByRole('button')).toHaveAttribute('data-guide', 'planner.approve')
  })
})
