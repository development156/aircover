import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE ROW IS CREATED BY THE FIRST SAVE, AND ONLY BY THE FIRST SAVE.
 *
 * ── WHY THIS IS A TEST AND NOT A COMMENT ────────────────────────────────────
 * "One route for writing a post, new or existing" pushes hard toward creating a
 * row when the screen opens, and the deleted create flow's own note records what
 * that cost: an "Untitled post" left behind by every abandoned click. The
 * opposite failure is worse and quieter — a composer that never creates one and
 * silently discards what was typed.
 *
 * Both are asserted here, along with the two things that make the created row
 * usable: it is created ONCE however many saves follow, and every later save
 * goes to it rather than making another.
 *
 * `savePost` and `createPost` are mocked because this is about the state machine,
 * not about the database. The database half is proved in a real browser by
 * `e2e/composer.spec.ts`, which reads the rows back with a service-role client.
 */

const savePost = vi.fn()
const createPost = vi.fn()

vi.mock('@/app/actions/posts', () => ({
  savePost: (...args: unknown[]) => savePost(...args),
  createPost: (...args: unknown[]) => createPost(...args),
}))

const { useAutosave } = await import('@/components/posts/use-autosave')

const NEW_ID = '33333333-3333-4333-8333-333333333333'

/**
 * `useAutosave` with no row, wired the way the composer wires it: the id lives in
 * a ref that `ensurePostId` fills synchronously, so a save queued in the same
 * tick sees it.
 */
function Harness() {
  const idRef = { current: null as string | null }
  // Re-created per render on purpose — the ref below is the composer's, and this
  // harness only needs it to survive one interaction.
  return <Inner idRef={idRef} />
}

function Inner({ idRef }: { idRef: { current: string | null } }) {
  const autosave = useAutosave(idRef.current, null, async () => {
    if (idRef.current !== null) return { ok: true as const, postId: idRef.current }
    const created = await createPost('')
    if (!created.ok) return { ok: false as const, message: created.message }
    idRef.current = created.postId
    return { ok: true as const, postId: created.postId }
  })
  return (
    <div>
      <span data-testid="status">{autosave.status}</span>
      <span data-testid="error">{autosave.error ?? ''}</span>
      <button type="button" onClick={() => autosave.update({ body: 'Chai.' })}>
        write
      </button>
      <button type="button" onClick={() => autosave.update({ body: 'Chai and buns.' })}>
        write again
      </button>
      <button type="button" onClick={() => void autosave.flush()}>
        flush
      </button>
    </div>
  )
}

const press = (label: string) => screen.getByRole('button', { name: label })

beforeEach(() => {
  savePost.mockReset()
  createPost.mockReset()
  savePost.mockResolvedValue({ ok: true, postId: NEW_ID, updatedAt: '2026-08-19T10:00:00.000Z' })
  createPost.mockResolvedValue({ ok: true, postId: NEW_ID })
})

describe('a post that does not exist yet', () => {
  test('creates nothing until something is written', async () => {
    render(<Harness />)
    // Mounted, rendered, and idle. THE assertion this file exists for: opening
    // the screen is not intent.
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('idle'))
    expect(createPost).not.toHaveBeenCalled()
    expect(savePost).not.toHaveBeenCalled()
  })

  test('the first save creates the row and writes to it', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(press('write'))
    await user.click(press('flush'))

    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(savePost).toHaveBeenCalledTimes(1))
    // The id the create returned, not a placeholder and not an empty string.
    expect(savePost.mock.calls[0]?.[0]).toBe(NEW_ID)
    expect(savePost.mock.calls[0]?.[1]).toMatchObject({ body: 'Chai.' })
  })

  test('a second save reuses the row rather than making another', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(press('write'))
    await user.click(press('flush'))
    await waitFor(() => expect(savePost).toHaveBeenCalledTimes(1))

    await user.click(press('write again'))
    await user.click(press('flush'))
    await waitFor(() => expect(savePost).toHaveBeenCalledTimes(2))

    // ONE create, TWO saves, one id. Two rows here is the debris the deleted flow
    // measured, arriving by a different door.
    expect(createPost).toHaveBeenCalledTimes(1)
    expect(savePost.mock.calls[1]?.[0]).toBe(NEW_ID)
  })

  test('a refused create is reported and nothing is written', async () => {
    const user = userEvent.setup()
    createPost.mockResolvedValue({ ok: false, message: 'Create a workspace first.' })
    render(<Harness />)

    await user.click(press('write'))
    await user.click(press('flush'))

    // The creator's own words, not ours. It is the side that knows why.
    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('Create a workspace first.'),
    )
    expect(screen.getByTestId('status').textContent).toBe('error')
    // And emphatically NOT a save against a row that does not exist.
    expect(savePost).not.toHaveBeenCalled()
  })
})
