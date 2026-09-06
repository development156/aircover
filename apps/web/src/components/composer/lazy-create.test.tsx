import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { toChannelSet } from '@sahoda/shared'

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
      <span data-testid="body">{autosave.draft.body}</span>
      <button type="button" onClick={() => autosave.update({ body: 'Chai.' })}>
        write
      </button>
      <button type="button" onClick={() => autosave.update({ body: 'Chai and buns.' })}>
        write again
      </button>
      <button
        type="button"
        onClick={() => autosave.update({ channels: toChannelSet(['instagram']) })}
      >
        pick
      </button>
      <button type="button" onClick={() => void autosave.flush()}>
        flush
      </button>
      <button type="button" onClick={() => void autosave.flush({ create: true })}>
        flush and create
      </button>
    </div>
  )
}

const press = (label: string) => screen.getByRole('button', { name: label })

beforeEach(() => {
  // ── THE TESTS IN THIS FILE ARE NOT INDEPENDENT WITHOUT THIS ────────────────
  // `useAutosave` stashes every keystroke in `sessionStorage` under
  // `sahoda.draft.new`, and its recovery effect reads that key back on the next
  // mount. `sessionStorage` is one object for the whole file, so without this a
  // test inherits the previous test's body and starts life already worth a row.
  // MEASURED: deleting the `worthARow` gate left "a channel choice on its own
  // creates nothing" GREEN in a whole-file run and RED when run alone. A guard
  // that only fails in isolation is not guarding the run anyone actually does.
  sessionStorage.clear()
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

  test('a channel choice on its own creates nothing, and the first words carry it', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(press('pick'))
    await user.click(press('flush'))

    // THE BARRIER. A bare `not.toHaveBeenCalled()` here would pass without the
    // fix by outrunning the promise chain, so the absence is asserted only after
    // a write that must be BEHIND it has landed — every write is serialised on
    // one chain, so the words arriving means the tick's save has already run.
    await user.click(press('write'))
    await user.click(press('flush'))
    await waitFor(() =>
      expect(savePost).toHaveBeenCalledWith(NEW_ID, expect.objectContaining({ body: 'Chai.' })),
    )

    expect(savePost).toHaveBeenCalledTimes(1)
    expect(createPost).toHaveBeenCalledTimes(1)
    // The tick was not lost on the way.
    expect(savePost.mock.calls[0]?.[1]).toMatchObject({ body: 'Chai.', channels: ['instagram'] })
  })

  test('an action that needs the row creates it with no words', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(press('pick'))
    await user.click(press('flush and create'))

    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1))
    // `body: ''` is the half this test is named for: the row exists BECAUSE the
    // caller asked for one, not because anything was written into it.
    expect(savePost.mock.calls[0]?.[1]).toMatchObject({ body: '', channels: ['instagram'] })
  })

  test('a create-flush with nothing to do does not arm the next save', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    // Nothing typed, nothing ticked: this returns at `sameDraft` without a row,
    // exactly as it does today. The flag it set must not survive that return.
    await user.click(press('flush and create'))
    await user.click(press('pick'))
    await user.click(press('flush'))

    await user.click(press('write'))
    await user.click(press('flush'))
    await waitFor(() =>
      expect(savePost).toHaveBeenCalledWith(NEW_ID, expect.objectContaining({ body: 'Chai.' })),
    )

    expect(createPost).toHaveBeenCalledTimes(1)
    expect(savePost).toHaveBeenCalledTimes(1)
  })
})

describe('a leftover crash buffer is not a reason to create a post', () => {
  /**
   * ── THE BUG THIS PINS ────────────────────────────────────────────────────────
   * The new-post crash buffer is one shared key (`sahoda.draft.new`). Recovery
   * used to re-enter `update()`, which armed the debounce, so simply reopening a
   * blank composer while a leftover buffer sat in the tab created a row from it —
   * and dropped an abandoned draft's words into a fresh, unrelated post. Opening
   * is not intent. The words are shown; the row waits for a keystroke.
   *
   * Remove `|| restoredUntouched.current` from the create gate and the unmount
   * flush turns the leftover into a row, and this goes red.
   */
  function seedLeftover() {
    sessionStorage.setItem(
      'sahoda.draft.new',
      JSON.stringify({ title: '', body: 'Leftover chai.', channels: [], scheduledAt: null }),
    )
  }

  test('the leftover words are shown but nothing is written on mount or on leave', async () => {
    seedLeftover()
    const { unmount } = render(<Harness />)

    // Restored to the editor so they are not lost...
    await waitFor(() => expect(screen.getByTestId('body').textContent).toBe('Leftover chai.'))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unsaved'))
    // ...but not persisted: opening the screen is not intent.
    expect(createPost).not.toHaveBeenCalled()
    expect(savePost).not.toHaveBeenCalled()

    // Navigating away (unmount → flush) must not turn the leftover into a row.
    unmount()
    await waitFor(() => expect(createPost).not.toHaveBeenCalled())
    expect(savePost).not.toHaveBeenCalled()
  })

  test('the first real edit after a restore does create the row', async () => {
    // Recovery is deferred, not broken: once the writer touches it, it behaves
    // like any other new post.
    seedLeftover()
    const user = userEvent.setup()
    render(<Harness />)

    await waitFor(() => expect(screen.getByTestId('body').textContent).toBe('Leftover chai.'))
    await user.click(press('write'))
    await user.click(press('flush'))

    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(savePost).toHaveBeenCalledWith(NEW_ID, expect.objectContaining({ body: 'Chai.' })),
    )
  })
})
