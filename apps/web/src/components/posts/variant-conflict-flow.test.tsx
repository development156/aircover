import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Channel, PostVariant } from '@sahoda/shared'

import type { SaveState } from '@/lib/posts/state'
import type { VariantVersions } from '@/lib/posts/variant-version'

/**
 * The whole clash, end to end, from the writer's side.
 *
 * ── WHAT THE LOWER TESTS CANNOT SEE ──────────────────────────────────────────
 * `posts-variant-cas.test.ts` proves the server refuses correctly, and
 * `variant-conflict-notice.test.tsx` proves the notice renders. Neither can see
 * the part that actually loses work: what the BOX contains afterwards, whether
 * the save button still offers to save, and what the retry sends.
 *
 * The rules the notice is built on are only true if this file holds:
 *
 *   1. the local text stays in the box — nothing is replaced until it is asked for;
 *   2. the writer is told, rather than shown a generic save error;
 *   3. "Keep mine" re-sends against the version the refusal reported, so it can
 *      actually win rather than be refused forever;
 *   4. "Use the saved version" lands in the BOX, not in the row;
 *   5. the draft stays unsaved throughout, because none of it has been saved.
 */

const calls = vi.hoisted(() => ({
  saves: [] as { channel: string; body: string; expectedVersion: number | null | undefined }[],
  answer: ((_call: number) => ({ ok: true, postId: 'p1', updatedAt: '' })) as (
    call: number,
  ) => SaveState,
}))

vi.mock('@/app/actions/posts', () => ({
  saveVariant: (
    _postId: string,
    channel: string,
    body: string,
    _extras: unknown,
    expectedVersion?: number | null,
  ) => {
    calls.saves.push({ channel, body, expectedVersion })
    return Promise.resolve(calls.answer(calls.saves.length))
  },
}))

const { useVariants } = await import('./use-variants')
const { VariantPanel } = await import('./variant-panel')

const CHANNEL: Channel = 'instagram'

const storedVariant = (body: string): PostVariant =>
  ({
    id: 'v1',
    workspace_id: 'w1',
    post_id: 'p1',
    channel: CHANNEL,
    body,
    extras: null,
    is_linked: false,
    char_count: body.length,
    publish_status: 'pending',
    platform_post_id: null,
    permalink: null,
    last_error: null,
    created_at: '',
    updated_at: '',
  }) as PostVariant

/** The panel, driven by the real hook — nothing about the wiring is stubbed. */
function Harness({ versions }: { versions: VariantVersions }) {
  const api = useVariants('p1', [storedVariant('TAB A wrote this.')], versions)
  const state = api.states[CHANNEL]
  return (
    <VariantPanel
      channel={CHANNEL}
      state={state}
      canonicalBody=""
      mediaCount={1}
      onBodyChange={(body) => api.setBody(CHANNEL, body)}
      onExtrasChange={() => {}}
      onSave={() => api.save(CHANNEL)}
      onKeepMine={() => api.keepMine(CHANNEL)}
      onUseTheirs={(theirs) => api.useTheirs(CHANNEL, theirs)}
    />
  )
}

const TRACKED: VariantVersions = { supported: true, byChannel: { [CHANNEL]: 4 } }
const UNTRACKED: VariantVersions = { supported: false }

const box = () => screen.getByLabelText(/copy$/i) as HTMLTextAreaElement
// Anchored, because the notice's own "Use the saved version" contains "saved"
// and an unanchored match finds two buttons.
const saveButton = () => screen.getByRole('button', { name: /^(save variant|saved|saving)$/i })

beforeEach(() => {
  calls.saves = []
  calls.answer = () => ({ ok: true, postId: 'p1', updatedAt: '' })
})

describe('before the migration — the column is not there', () => {
  test('saves without claiming to compare against anything', async () => {
    const user = userEvent.setup()
    render(<Harness versions={UNTRACKED} />)

    await user.type(box(), '!')
    await user.click(saveButton())

    await waitFor(() => expect(calls.saves).toHaveLength(1))
    // `undefined`, not null. Null would ask the database to CREATE, which for an
    // existing row is refused — turning every save into a phantom clash.
    expect(calls.saves[0]?.expectedVersion).toBeUndefined()
  })

  test('shows no clash, because nothing can detect one', async () => {
    const user = userEvent.setup()
    render(<Harness versions={UNTRACKED} />)

    await user.type(box(), '!')
    await user.click(saveButton())

    await waitFor(() => expect(calls.saves).toHaveLength(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('after the migration — someone else got there first', () => {
  const refusal: SaveState = {
    ok: false,
    message: 'Someone else saved this version while you were writing. Your text is still here.',
    conflict: { channel: CHANNEL, theirs: 'TAB B wrote this second.', version: 7 },
  }

  test('sends the version it read', async () => {
    const user = userEvent.setup()
    render(<Harness versions={TRACKED} />)

    await user.type(box(), '!')
    await user.click(saveButton())

    await waitFor(() => expect(calls.saves).toHaveLength(1))
    expect(calls.saves[0]?.expectedVersion).toBe(4)
  })

  test('keeps the writer’s own text in the box, and names the channel', async () => {
    calls.answer = () => refusal
    const user = userEvent.setup()
    render(<Harness versions={TRACKED} />)

    await user.clear(box())
    await user.type(box(), 'TAB A, unaware of B.')
    await user.click(saveButton())

    const alert = await screen.findByRole('alert')
    // Rule 1. The thing a reflex-friendly "reload?" dialog destroys.
    expect(box().value).toBe('TAB A, unaware of B.')
    // The CHANNEL is named, not "this post", and their words are shown in full.
    expect(alert).toHaveTextContent(/Instagram/i)
    expect(alert).toHaveTextContent('TAB B wrote this second.')
  })

  test('does not also show a generic save error', async () => {
    calls.answer = () => refusal
    const user = userEvent.setup()
    render(<Harness versions={TRACKED} />)

    await user.type(box(), '!')
    await user.click(saveButton())

    await screen.findByRole('alert')
    // Two messages about one refusal is how a writer learns to read neither.
    expect(screen.queryByText(/Could not save this variant/i)).toBeNull()
  })

  test('leaves the draft unsaved, so the button still offers to save it', async () => {
    calls.answer = () => refusal
    const user = userEvent.setup()
    render(<Harness versions={TRACKED} />)

    await user.type(box(), '!')
    await user.click(saveButton())

    await screen.findByRole('alert')
    // Marking it saved would disable the only control that could save it.
    expect(saveButton()).toHaveTextContent(/save variant/i)
    expect(saveButton()).not.toBeDisabled()
  })

  test('"Keep mine" re-sends against the version the refusal reported', async () => {
    calls.answer = (call) => (call === 1 ? refusal : { ok: true, postId: 'p1', updatedAt: '' })
    const user = userEvent.setup()
    render(<Harness versions={TRACKED} />)

    await user.clear(box())
    await user.type(box(), 'mine')
    await user.click(saveButton())
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: /keep mine/i }))

    await waitFor(() => expect(calls.saves).toHaveLength(2))
    // 7, not 4. Re-sending the version that was just refused would fail forever,
    // which is a notice the writer can never clear.
    expect(calls.saves[1]).toMatchObject({ body: 'mine', expectedVersion: 7 })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  test('"Use the saved version" loads their text into the box and writes nothing', async () => {
    calls.answer = () => refusal
    const user = userEvent.setup()
    render(<Harness versions={TRACKED} />)

    await user.clear(box())
    await user.type(box(), 'mine')
    await user.click(saveButton())
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: /use the saved version/i }))

    // Into the BOX, not the row. One save has been attempted, not two.
    expect(box().value).toBe('TAB B wrote this second.')
    expect(calls.saves).toHaveLength(1)
    // And it is offered as unsaved, because it is: the writer can still edit or
    // undo before any of it lands.
    expect(saveButton()).toHaveTextContent(/save variant/i)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('a second clash replaces the first rather than stacking', async () => {
    const later: SaveState = {
      ok: false,
      message: 'Someone else saved this version while you were writing. Your text is still here.',
      conflict: { channel: CHANNEL, theirs: 'TAB C, later still.', version: 9 },
    }
    calls.answer = (call) => (call === 1 ? refusal : later)
    const user = userEvent.setup()
    render(<Harness versions={TRACKED} />)

    await user.type(box(), '!')
    await user.click(saveButton())
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /keep mine/i }))

    await waitFor(() => expect(calls.saves).toHaveLength(2))
    // Losing twice costs a round trip, never a word — and the writer is shown the
    // NEWER text, not the one they already declined.
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent('TAB C, later still.')
  })

  test('a successful save adopts the new version for the next one', async () => {
    calls.answer = () => ({ ok: true, postId: 'p1', updatedAt: '', version: 5 })
    const user = userEvent.setup()
    render(<Harness versions={TRACKED} />)

    await user.type(box(), '!')
    await user.click(saveButton())
    await waitFor(() => expect(calls.saves).toHaveLength(1))

    await user.type(box(), '?')
    await user.click(saveButton())

    await waitFor(() => expect(calls.saves).toHaveLength(2))
    // Still sending 4 here would make the writer's own previous save look like
    // someone else's — a clash with themselves, on every save after the first.
    expect(calls.saves[1]?.expectedVersion).toBe(5)
  })
})
