import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `setWorkspaceTimezone` — the two things a wrong answer here would cost.
 *
 * A timezone that is not a real zone does not fail loudly. It produces a
 * confidently wrong hour, for one customer, in the feature that exists to tell
 * them when to post. So the value is checked against what the runtime can
 * actually resolve, and the database trigger checks it again. Two independent
 * refusals, and this file pins the first one.
 *
 * The second thing is quieter and has bitten this codebase before: PostgREST
 * returns a null error for an UPDATE that matched NO ROWS. An update that RLS
 * refused therefore looks exactly like a successful one unless a row is read
 * back. `renameWorkspace` learned that; this must not unlearn it.
 */

const maybeSingle = vi.fn()
const select = vi.fn(() => ({ maybeSingle }))
const eq = vi.fn(() => ({ select }))
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'user_1' })),
  currentUser: vi.fn(async () => null),
}))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({ from }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { setWorkspaceTimezone } from './workspace'

const WS = '11111111-1111-4111-8111-111111111111'

describe('setWorkspaceTimezone', () => {
  beforeEach(() => {
    from.mockClear()
    update.mockClear()
    maybeSingle.mockReset()
    maybeSingle.mockResolvedValue({ data: { timezone: 'Europe/London' }, error: null })
  })

  it('stores a real zone', async () => {
    const result = await setWorkspaceTimezone(WS, 'Europe/London')

    expect(result).toEqual({ ok: true, timezone: 'Europe/London' })
    expect(update).toHaveBeenCalledWith({ timezone: 'Europe/London' })
  })

  it('REFUSES a plausible typo, and writes nothing at all', async () => {
    const result = await setWorkspaceTimezone(WS, 'Asia/Kolkatta')

    expect(result).toEqual({
      ok: false,
      message: 'Sahoda does not recognise the time zone Asia/Kolkatta.',
    })
    // The refusal has to happen BEFORE the write, not be reported after it.
    expect(update).not.toHaveBeenCalled()
  })

  it('stores NULL when the answer is withdrawn, never an empty string', async () => {
    // An empty string would be a stored zone that resolves to nothing. NULL is
    // the value that means nobody has told us, and it is a real answer.
    maybeSingle.mockResolvedValue({ data: { timezone: null }, error: null })

    const result = await setWorkspaceTimezone(WS, '')

    expect(result).toEqual({ ok: true, timezone: null })
    expect(update).toHaveBeenCalledWith({ timezone: null })
  })

  it('treats a whitespace-only answer as withdrawing it, not as a zone', async () => {
    maybeSingle.mockResolvedValue({ data: { timezone: null }, error: null })

    await setWorkspaceTimezone(WS, '   ')

    expect(update).toHaveBeenCalledWith({ timezone: null })
  })

  it('does not report success when the update matched no row', async () => {
    // The RLS case. PostgREST reports no error here, so the missing row IS the
    // error, and a caller that trusted `error === null` would tell somebody
    // their setting was saved when it was refused.
    maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await setWorkspaceTimezone(WS, 'Europe/London')

    // And it says so in its OWN sentence. "Try again" cannot help somebody
    // whose write RLS refused, and while both arms shared one message this
    // assertion could not tell the guard from the try/catch that masked it.
    expect(result).toEqual({ ok: false, message: 'That workspace could not be found.' })
  })

  it('says something different when the database itself failed', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'connection lost' } })

    const result = await setWorkspaceTimezone(WS, 'Europe/London')

    expect(result).toEqual({ ok: false, message: 'Could not save the time zone. Try again.' })
  })

  it('refuses an id that is not a workspace id, before touching the database', async () => {
    const result = await setWorkspaceTimezone('not-a-uuid', 'Europe/London')

    expect(result).toEqual({ ok: false, message: 'That workspace could not be found.' })
    expect(from).not.toHaveBeenCalled()
  })
})
