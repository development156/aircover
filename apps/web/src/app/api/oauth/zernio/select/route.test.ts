import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE CALL THAT ACTUALLY CREATES A FACEBOOK ACCOUNT.
 *
 * ── WHY THIS ROUTE EXISTS ────────────────────────────────────────────────────
 * MEASURED 2026-08-27: `GET /v1/accounts` held ZERO facebook accounts across
 * every profile on this key, while `GET /v1/connect/facebook` returned a valid
 * authUrl every time. Nothing had failed. Facebook resolves to every Page the
 * customer administers, Google Business to every location, and **Zernio creates
 * nothing until one is picked**. The return route renders that pick; this commits
 * it, and until it returns 200 there is no account for anything to reconcile.
 *
 * ── WHAT THESE TESTS ARE ABOUT ───────────────────────────────────────────────
 * Not the happy path alone. This route receives a form submitted by a browser that
 * has just come back from facebook.com, and doc 13 §3 is the standing reason
 * nothing arriving that way may NAME a resource: Zernio validates an id against
 * the whole TEAM, so a wrong one does not error — it acts on somebody else's
 * account and returns 200. There is no downstream failure to catch.
 */

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  clientPresent: true,
  workspace: { id: 'ws-1', name: 'Chai & Chapters' } as { id: string; name: string } | null,
  mapping: { profile_id: '6a75cae32853ee463c6419d6' } as { profile_id: string } | null,
  /** What the httpOnly cookie holds, as the picker page set it. */
  pending: {
    platform: 'facebook',
    state: { profileId: '6a75cae32853ee463c6419d6', tempToken: 'EAAxxLIVETOKENxx' },
  } as { platform: string; state: Record<string, unknown> } | null,
  choices: [{ id: '111222333', name: 'Chai & Chapters', detail: null, ownerId: null }] as {
    id: string
    name: string
    detail: string | null
    ownerId: string | null
  }[],
  choicesThrow: false,
  selectThrows: false,
  /** Every commit the route made, as `platform:id:ownerId`. */
  selectCalls: [] as string[],
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/zernio/server', () => ({
  zernioClient: () =>
    state.clientPresent
      ? {
          listConnectChoices: () => {
            if (state.choicesThrow) return Promise.reject(new Error('list failed'))
            return Promise.resolve({ choices: state.choices, hasMore: false })
          },
          selectConnectChoice: (
            platform: string,
            _oauth: unknown,
            choice: { id: string; ownerId?: string | null },
          ) => {
            if (state.selectThrows) return Promise.reject(new Error('select failed'))
            state.selectCalls.push(`${platform}:${choice.id}:${choice.ownerId ?? '-'}`)
            return Promise.resolve()
          },
        }
      : null,
}))

vi.mock('@/lib/workspaces', () => ({
  readActiveWorkspace: async () => {
    const w = await Promise.resolve(state.workspace)
    return w ? { status: 'ok', workspace: w } : { status: 'none' }
  },
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: () => Promise.resolve() }))

// A SEAM. What the cookie looks like on the wire is pending-selection.test.ts's
// job; this file is about what the ROUTE does with the answer.
vi.mock('@/lib/connections/pending-selection', () => ({
  CLEAR_PENDING_SELECTION: 'sahoda_connect_pick=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  readPendingSelection: () => Promise.resolve(state.pending),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.mapping, error: null }) }),
      }),
    }),
  }),
}))

const { POST } = await import('./route')

const submit = (choiceId: string, query = '?mode=popup') => {
  const body = new URLSearchParams()
  body.set('choiceId', choiceId)
  return POST(
    new Request(`https://app.sahodalabs.com/api/oauth/zernio/select${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }),
  )
}

beforeEach(() => {
  state.userId = 'user_1'
  state.clientPresent = true
  state.workspace = { id: 'ws-1', name: 'Chai & Chapters' }
  state.mapping = { profile_id: '6a75cae32853ee463c6419d6' }
  state.pending = {
    platform: 'facebook',
    state: { profileId: '6a75cae32853ee463c6419d6', tempToken: 'EAAxxLIVETOKENxx' },
  }
  state.choices = [{ id: '111222333', name: 'Chai & Chapters', detail: null, ownerId: null }]
  state.choicesThrow = false
  state.selectThrows = false
  state.selectCalls = []
})

describe('committing the pick', () => {
  it('creates the account at Zernio and hands back to the return route', async () => {
    const res = await submit('111222333')

    expect(state.selectCalls).toEqual(['facebook:111222333:-'])
    expect(res.status).toBe(303)
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.pathname).toBe('/api/oauth/zernio/return')
    expect(location.searchParams.get('platform')).toBe('facebook')
    expect(location.searchParams.get('mode')).toBe('popup')
  })

  it('hands back OUR channel id for Google Business, not Zernio’s', async () => {
    // `googlebusiness` is `gbp` to us, and the return route validates the platform
    // against our own allowlist: Zernio's spelling lands on the fail-closed branch
    // that creates NO ROW. That exact mistranslation has already cost this
    // integration two reported defects, in `connectUrl` and in `reconcileAccounts`.
    state.pending = {
      platform: 'googlebusiness',
      state: { profileId: '6a75cae32853ee463c6419d6', pendingDataToken: 'pdt_abc' },
    }
    state.choices = [
      { id: '9281089117903930794', name: 'Chai & Chapters', detail: null, ownerId: 'accounts/113' },
    ]

    const res = await submit('9281089117903930794')
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.searchParams.get('platform')).toBe('gbp')
  })

  it('takes the owning account off ITS list, never off the form', async () => {
    // The form carries one field. If a location's owning account were a hidden
    // input, a submit could pair one location's id with another's account — and
    // Zernio resolves an accountId against the whole team, so that would not error.
    state.pending = {
      platform: 'googlebusiness',
      state: { profileId: '6a75cae32853ee463c6419d6', pendingDataToken: 'pdt_abc' },
    }
    state.choices = [{ id: '928108', name: 'Chai', detail: null, ownerId: 'accounts/113' }]

    await submit('928108')
    expect(state.selectCalls).toEqual(['googlebusiness:928108:accounts/113'])
  })

  it('spends the cookie, so a replay cannot commit twice', async () => {
    const res = await submit('111222333')
    expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0')
  })
})

describe('what this route refuses', () => {
  it('refuses an id that is not on the list it fetched for itself', async () => {
    // THE GUARD THAT MATTERS. The id arrives in a form body from a browser that has
    // just come back from facebook.com. It is checked against a list this route
    // fetches, not against the page it rendered.
    const res = await submit('999999999')

    expect(res.status).toBe(400)
    expect(state.selectCalls).toEqual([])
  })

  it('refuses a profile that is not this workspace’s', async () => {
    state.pending = {
      platform: 'facebook',
      state: { profileId: 'ffffffffffffffffffffffff', tempToken: 'EAAxx' },
    }
    const res = await submit('111222333')

    expect(res.status).toBe(403)
    expect(state.selectCalls).toEqual([])
  })

  it('refuses when the pick expired, and says nothing was changed', async () => {
    state.pending = null
    const res = await submit('111222333')

    expect(res.status).toBe(400)
    expect(await res.text()).toContain('nothing was changed')
    expect(state.selectCalls).toEqual([])
  })

  it('refuses a signed-out submit', async () => {
    state.userId = null
    expect((await submit('111222333')).status).toBe(401)
    expect(state.selectCalls).toEqual([])
  })

  it('refuses an empty choice rather than sending Zernio a blank id', async () => {
    const res = await submit('')
    expect(res.status).toBe(400)
    expect(state.selectCalls).toEqual([])
  })

  it('reports a failed list read as a failure, not as an unknown choice', async () => {
    // Two different sentences: "that Page is not yours" and "we could not ask".
    // Collapsing them would tell a customer their own Page does not exist.
    state.choicesThrow = true
    const res = await submit('111222333')
    expect(res.status).toBe(502)
  })

  it('keeps a failed commit OUT of the success channel', async () => {
    // This route exists in its shape because a failure leaving as a 303 is
    // invisible to a 4xx/5xx log filter — the flaw that made this whole flow
    // undiagnosable for a day. A failed commit must not answer with a redirect.
    state.selectThrows = true
    const res = await submit('111222333')

    expect(res.status).toBe(502)
    expect(res.headers.get('location')).toBeNull()
  })

  it('never puts the platform token in a failure page either', async () => {
    state.selectThrows = true
    expect(await (await submit('111222333')).text()).not.toContain('EAA')
  })
})
