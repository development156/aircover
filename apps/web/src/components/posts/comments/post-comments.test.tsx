import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { CommentRow } from '@/lib/approvals/context'

/**
 * THE THREAD BESIDE A POST.
 *
 * Newest last, a bounded box with a count, Cmd/Ctrl+Enter to send, an
 * optimistic append that is ROLLED BACK on refusal, and a removed comment that
 * keeps its place as "Comment removed" rather than vanishing.
 */

const addComment = vi.fn()
const removeComment = vi.fn()
vi.mock('@/app/actions/post-comments', () => ({
  addComment: (...args: unknown[]) => addComment(...args),
  removeComment: (...args: unknown[]) => removeComment(...args),
  listComments: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { PostComments } = await import('./post-comments')

const ME = 'user_me'
const comment = (overrides: Partial<CommentRow> & { id: string }): CommentRow => ({
  post_id: 'p1',
  author: ME,
  body: 'A comment',
  created_at: '2026-09-06T10:00:00.000Z',
  deleted_at: null,
  ...overrides,
})

function thread(initial: CommentRow[] = [], currentUserId: string | null = ME) {
  return render(
    <PostComments
      postId="p1"
      initial={initial}
      currentUserId={currentUserId}
      zone="Asia/Kolkata"
    />,
  )
}

beforeEach(() => {
  addComment.mockReset()
  removeComment.mockReset()
})
afterEach(cleanup)

describe('the list', () => {
  test('renders newest last, names people as you or a teammate, never by id', () => {
    thread([
      comment({
        id: 'c1',
        author: 'user_other',
        body: 'First',
        created_at: '2026-09-06T09:00:00Z',
      }),
      comment({ id: 'c2', author: ME, body: 'Second', created_at: '2026-09-06T10:00:00Z' }),
    ])
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('First')
    expect(items[0]).toHaveTextContent('A teammate')
    expect(items[1]).toHaveTextContent('Second')
    expect(items[1]).toHaveTextContent('You')
    expect(document.body.textContent).not.toContain('user_other')
  })

  test('a removed comment keeps its place and says so, without its words', () => {
    thread([comment({ id: 'c1', body: 'Secret', deleted_at: '2026-09-06T11:00:00Z' })])
    expect(screen.getByRole('listitem')).toHaveTextContent('Comment removed')
    expect(document.body.textContent).not.toContain('Secret')
  })

  test('only your own live comments carry Remove', () => {
    thread([
      comment({ id: 'mine' }),
      comment({ id: 'theirs', author: 'user_other' }),
      comment({ id: 'gone', deleted_at: '2026-09-06T11:00:00Z' }),
    ])
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(1)
  })

  test('an empty thread says so in words', () => {
    thread([])
    expect(screen.getByText('No comments yet.')).toBeInTheDocument()
  })
})

describe('adding', () => {
  test('appends optimistically, then keeps the server row', async () => {
    addComment.mockResolvedValue({
      ok: true,
      comment: comment({ id: 'server-1', body: 'Shorten it.' }),
    })
    const user = userEvent.setup()
    thread([])

    await user.type(screen.getByLabelText(/add a comment/i), 'Shorten it.')
    expect(screen.getByText('11 / 2000')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^add comment$/i }))

    expect(screen.getByRole('listitem')).toHaveTextContent('Shorten it.')
    await waitFor(() => expect(addComment).toHaveBeenCalledWith('p1', 'Shorten it.'))
    expect((screen.getByLabelText(/add a comment/i) as HTMLTextAreaElement).value).toBe('')
  })

  test('Cmd+Enter sends', async () => {
    addComment.mockResolvedValue({ ok: true, comment: comment({ id: 's', body: 'Go' }) })
    const user = userEvent.setup()
    thread([])
    await user.type(screen.getByLabelText(/add a comment/i), 'Go')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    await waitFor(() => expect(addComment).toHaveBeenCalledWith('p1', 'Go'))
  })

  test('a refusal rolls the append back and gives the words back', async () => {
    addComment.mockResolvedValue({
      ok: false,
      message: 'Sahoda could not add the comment. Try again.',
    })
    const user = userEvent.setup()
    thread([])

    await user.type(screen.getByLabelText(/add a comment/i), 'Lost?')
    await user.click(screen.getByRole('button', { name: /^add comment$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not add/i))
    expect(screen.queryByRole('listitem')).toBeNull()
    expect((screen.getByLabelText(/add a comment/i) as HTMLTextAreaElement).value).toBe('Lost?')
  })

  test('the box refuses more than 2000 characters', () => {
    thread([])
    expect(screen.getByLabelText(/add a comment/i)).toHaveAttribute('maxlength', '2000')
  })
})

describe('removing', () => {
  test('marks the row removed at once, and restores it if the server refuses', async () => {
    removeComment.mockResolvedValue({
      ok: false,
      message: 'Only the person who wrote a comment can remove it.',
    })
    const user = userEvent.setup()
    thread([comment({ id: 'mine', body: 'Keep me' })])

    await user.click(screen.getByRole('button', { name: /remove/i }))
    await waitFor(() => expect(removeComment).toHaveBeenCalledWith('mine'))
    await waitFor(() =>
      expect(within(screen.getByRole('listitem')).getByText('Keep me')).toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/only the person who wrote/i)
  })

  test('a confirmed removal stays removed', async () => {
    removeComment.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    thread([comment({ id: 'mine', body: 'Bye' })])
    await user.click(screen.getByRole('button', { name: /remove/i }))
    await waitFor(() => expect(screen.getByRole('listitem')).toHaveTextContent('Comment removed'))
    expect(document.body.textContent).not.toContain('Bye')
  })
})
