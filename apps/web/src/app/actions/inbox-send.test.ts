import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ATTACHING A LIBRARY FILE TO A DM REPLY, FROM THE ACTION DOWN.
 *
 * ── WHAT IS REAL HERE AND WHAT IS FAKED ──────────────────────────────────────
 * The REAL `replyToThread` and the REAL `resolveAttachment` run: they hold the two
 * decisions that can be wrong. Only the edges are faked — Clerk, the Zernio ports,
 * Supabase, the storage signer and the store write. So what these tests pin is the
 * path a request actually takes, not a rehearsal of it.
 *
 * ── THE PROPERTY THAT MATTERS MOST IS THE ONE ABOUT SOMEBODY ELSE ────────────
 * The browser sends an ASSET ID, never a url. An id belonging to another workspace
 * has to be refused before a byte leaves, because the reply goes out under this
 * customer's name into a conversation with their customer. `assets` is queried with
 * the active workspace beside the id, and the "foreign" test drives that filter
 * rather than an empty list.
 */

const state = vi.hoisted(() => ({
  workspace: 'ws-1' as string | null,
  /** The `assets` row the scoped query finds, or null for "no such row here". */
  assetRow: null as Record<string, unknown> | null,
  /** What the storage signer returns. null is a signing FAILURE, not an absent file. */
  signedUrl: 'https://cdn.example.com/a.jpg?token=t' as string | null,
  /** Every `assets` query's filters, so the tenancy scoping is checkable. */
  assetFilters: [] as [string, unknown][],
  sendArgs: [] as unknown[][],
  recorded: [] as Record<string, unknown>[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_1' }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: () => {} }))
// Only for its `commentsHref`. The module is a `.tsx` component and this suite runs in
// the node project, which does not transform JSX; the DM path never calls it.
vi.mock('@/components/inbox/commented-post-row', () => ({
  commentsHref: () => '/inbox/comments/a/b',
}))

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve(
      state.workspace === null
        ? { status: 'none' }
        : { status: 'ok', workspace: { id: state.workspace, name: 'W', slug: 'w' } },
    ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        state.assetFilters.push([column, value])
        return chain
      },
      maybeSingle: () =>
        Promise.resolve({
          // The scoped query only finds the row when BOTH filters match, which is
          // what makes the foreign-id case a real refusal rather than an empty table.
          data:
            state.assetRow !== null &&
            state.assetFilters.some(([c, v]) => c === 'workspace_id' && v === state.workspace) &&
            state.assetFilters.some(([c, v]) => c === 'id' && v === state.assetRow?.id)
              ? state.assetRow
              : null,
          error: null,
        }),
    }
    return { from: () => chain }
  },
}))

vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (rows: { id: string }[]) =>
    Promise.resolve(rows.map((row) => ({ id: row.id, url: state.signedUrl }))),
}))

vi.mock('@/lib/inbox/record-sent', () => ({
  recordSentReply: (reply: Record<string, unknown>) => {
    state.recorded.push(reply)
    return Promise.resolve('recorded')
  },
}))

vi.mock('@/lib/zernio/server', () => ({
  zernioClientSends: () => ({
    sendMessage: (...args: unknown[]) => {
      state.sendArgs.push(args)
      return Promise.resolve({ sent: true, platformId: 'mid.out' })
    },
  }),
}))

const NOW = Date.now()
vi.mock('@/lib/inbox/read', () => ({
  scopedAccount: () =>
    Promise.resolve({
      ok: true,
      profile: 'profile-1',
      account: 'account-1',
      reads: {
        // One inbound message a minute old, so the free-form window is wide open and
        // the send is never refused for a reason this file is not about.
        listMessages: () =>
          Promise.resolve({
            messages: [
              {
                id: 'in-1',
                platform: 'instagram',
                direction: 'incoming',
                createdAt: new Date(NOW - 60_000).toISOString(),
              },
            ],
            pagination: { hasMore: false, nextCursor: null },
            sortOrderApplied: 'desc',
          }),
      },
    }),
}))

const { sendThreadReply } = await import('./inbox-send')

const ASSET = '2c2b7a4e-1f0a-4a0e-9d3f-9b3d2a1c7e55'
const OURS = { id: ASSET, storage_path: 'ws-1/a.jpg', mime: 'image/jpeg', deleted_at: null }

const body = () => state.sendArgs[0]?.[3] as Record<string, unknown>

beforeEach(() => {
  state.workspace = 'ws-1'
  state.assetRow = { ...OURS }
  state.signedUrl = 'https://cdn.example.com/a.jpg?token=t'
  state.assetFilters = []
  state.sendArgs = []
  state.recorded = []
})

describe('sendThreadReply — one attachment from the library', () => {
  it('resolves the asset to a signed url and sends it with the mapped type', async () => {
    const outcome = await sendThreadReply('acct', 'conv-1', 'Here it is', undefined, {
      assetId: ASSET,
    })

    expect(outcome).toEqual({ ok: true, platformId: 'mid.out' })
    expect(body().attachmentUrl).toBe('https://cdn.example.com/a.jpg?token=t')
    expect(body().attachmentType).toBe('image')
  })

  it('maps the mime rather than trusting the caller: a video is video, a pdf is file', async () => {
    state.assetRow = { ...OURS, mime: 'video/mp4' }
    await sendThreadReply('acct', 'c', 'clip', undefined, { assetId: ASSET })
    expect(body().attachmentType).toBe('video')

    state.sendArgs = []
    state.assetFilters = []
    state.assetRow = { ...OURS, mime: 'application/pdf' }
    await sendThreadReply('acct', 'c', 'doc', undefined, { assetId: ASSET })
    // `file` is Zernio's own default for an unnamed type, and the honest answer for
    // a mime we do not recognise. Guessing `image` would have the platform reject
    // the whole reply, words included.
    expect(body().attachmentType).toBe('file')
  })

  it('sends no attachment keys at all when no file was chosen', async () => {
    await sendThreadReply('acct', 'conv-1', 'Just words')
    expect(Object.keys(body()).sort()).toEqual(['message', 'wire'])
  })

  /**
   * The one that matters. A url parameter would make this reachable; an id checked
   * against the active workspace is what makes it unreachable.
   */
  it('refuses an asset id that is not this workspace’s, and sends nothing', async () => {
    state.assetRow = { ...OURS, id: 'someone-elses' }

    const outcome = await sendThreadReply('acct', 'conv-1', 'Here it is', undefined, {
      assetId: ASSET,
    })

    expect(outcome).toEqual({
      ok: false,
      status: 'refused',
      message: expect.stringContaining('could not find that file'),
    })
    expect(state.sendArgs).toEqual([])
    // Scoped by BOTH, or the id alone would be the boundary and the member policy
    // admits every workspace this person belongs to.
    expect(state.assetFilters).toContainEqual(['workspace_id', 'ws-1'])
  })

  it('refuses a file in the trash, and says which problem it is', async () => {
    state.assetRow = { ...OURS, deleted_at: '2026-09-01T00:00:00.000Z' }
    const outcome = await sendThreadReply('acct', 'c', 'Here', undefined, { assetId: ASSET })

    expect(outcome).toMatchObject({ ok: false, status: 'refused' })
    if (outcome.ok) throw new Error('unreachable')
    expect(outcome.message).toMatch(/trash/i)
    expect(state.sendArgs).toEqual([])
  })

  /**
   * A reply whose photo silently vanished reads on screen as a success. It is not one:
   * the writer attached a picture and the recipient would get words about a picture.
   */
  it('refuses rather than sending the words alone when the link cannot be signed', async () => {
    state.signedUrl = null
    const outcome = await sendThreadReply('acct', 'c', 'Here it is', undefined, { assetId: ASSET })

    expect(outcome).toMatchObject({ ok: false, status: 'refused' })
    expect(state.sendArgs).toEqual([])
  })

  it('files the attachment on the stored row, so the thread renders what was sent', async () => {
    await sendThreadReply('acct', 'conv-1', 'Here it is', undefined, { assetId: ASSET })

    expect(state.recorded[0]?.attachments).toEqual([
      { type: 'image', url: 'https://cdn.example.com/a.jpg?token=t' },
    ])
  })

  it('files no attachments key on a reply that had none', async () => {
    await sendThreadReply('acct', 'conv-1', 'Just words')
    expect(state.recorded[0]).not.toHaveProperty('attachments')
  })
})
