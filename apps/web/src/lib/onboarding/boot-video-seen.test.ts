import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE FLAG THAT STOPS A TEN-SECOND FILM PLAYING TWICE.
 *
 * Two things can go wrong here and neither of them raises an error, which is
 * exactly why they are pinned:
 *
 *  1. A write that CLOBBERS. `prefs` is a shared jsonb column with live keys in
 *     production today — `mode`, `sahoda`, `reduced_motion`, `theme_override`
 *     are all in one real row. PostgREST cannot express a `jsonb ||` merge, so
 *     the write is a read-modify-write, and an unconditional
 *     `{ boot_video_seen: true }` would erase the other four while reporting
 *     success.
 *
 *  2. A write that MATCHES NOTHING. supabase-js reports an UPDATE that hit zero
 *     rows as `{ error: null }` — indistinguishable from one that landed. RLS
 *     also refuses by matching zero rows rather than by erroring. Either way the
 *     flag would never persist and the animation would play on every visit
 *     forever, with the server logs saying nothing at all.
 */

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  /** What the profile row holds before the write. `null` = no row. */
  prefs: null as Record<string, unknown> | null,
  hasRow: true,
  readError: null as { code: string; message: string } | null,
  writeError: null as { code: string; message: string } | null,
  /** How many rows the UPDATE reports having matched. */
  updatedRows: 1,
  /** What was actually sent to `.update()`. The clobber assertion reads this. */
  written: null as Record<string, unknown> | null,
  throws: false,
}))

vi.mock('server-only', () => ({}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from() {
      if (state.throws) throw new Error('socket hang up')
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.update = (patch: Record<string, unknown>) => {
        state.written = patch
        return {
          eq: () => ({
            select: () =>
              Promise.resolve({
                data: state.writeError
                  ? null
                  : Array.from({ length: state.updatedRows }, () => ({ user_id: 'user_1' })),
                error: state.writeError,
              }),
          }),
        }
      }
      builder.maybeSingle = () =>
        Promise.resolve({
          data: state.readError ? null : state.hasRow ? { prefs: state.prefs } : null,
          error: state.readError,
        })
      return builder
    },
  }),
}))

import { readBootVideoSeen, writeBootVideoSeen } from './boot-video-seen'

beforeEach(() => {
  state.userId = 'user_1'
  state.prefs = {}
  state.hasRow = true
  state.readError = null
  state.writeError = null
  state.updatedRows = 1
  state.written = null
  state.throws = false
})

describe('reading', () => {
  test('the flag set reads seen', async () => {
    state.prefs = { boot_video_seen: true }
    await expect(readBootVideoSeen()).resolves.toBe('seen')
  })

  test('empty prefs read not-seen', async () => {
    state.prefs = {}
    await expect(readBootVideoSeen()).resolves.toBe('not-seen')
  })

  test('other prefs present but no flag reads not-seen', async () => {
    state.prefs = { mode: 'guided', reduced_motion: false }
    await expect(readBootVideoSeen()).resolves.toBe('not-seen')
  })

  test('no profile row reads not-seen', async () => {
    state.hasRow = false
    await expect(readBootVideoSeen()).resolves.toBe('not-seen')
  })

  /**
   * `unknown` is NOT `not-seen`, and the caller turns it into "treat as seen".
   * A failed read must not play an unskippable film at somebody who has already
   * watched it.
   */
  test('a failed read is unknown, never not-seen', async () => {
    state.readError = { code: '57014', message: 'statement timeout' }
    await expect(readBootVideoSeen()).resolves.toBe('unknown')
  })

  test('a thrown read is unknown, never not-seen', async () => {
    state.throws = true
    await expect(readBootVideoSeen()).resolves.toBe('unknown')
  })

  test('signed out is unknown, never not-seen', async () => {
    state.userId = null
    await expect(readBootVideoSeen()).resolves.toBe('unknown')
  })

  test('an unreadable answer and an empty one are different answers', async () => {
    state.prefs = {}
    const empty = await readBootVideoSeen()
    state.readError = { code: 'PGRST301', message: 'JWT expired' }
    const failed = await readBootVideoSeen()
    expect(empty).not.toEqual(failed)
  })

  test('a non-object prefs value does not throw', async () => {
    state.prefs = 'corrupted' as unknown as Record<string, unknown>
    await expect(readBootVideoSeen()).resolves.toBe('not-seen')
  })
})

describe('writing', () => {
  test('a matched row is saved', async () => {
    await expect(writeBootVideoSeen()).resolves.toBe('saved')
  })

  /**
   * THE CLOBBER. Four real keys from a real production row go in; all four have
   * to come back out alongside the new one.
   */
  test('the other preferences survive the write', async () => {
    state.prefs = {
      mode: 'guided',
      sahoda: { muted: false, frequency: 'normal', personality: 'warm' },
      reduced_motion: false,
      theme_override: null,
    }

    await expect(writeBootVideoSeen()).resolves.toBe('saved')

    expect(state.written).toEqual({
      prefs: {
        mode: 'guided',
        sahoda: { muted: false, frequency: 'normal', personality: 'warm' },
        reduced_motion: false,
        theme_override: null,
        boot_video_seen: true,
      },
    })
  })

  test('the flag is written even when the row had no prefs at all', async () => {
    state.prefs = null
    await expect(writeBootVideoSeen()).resolves.toBe('saved')
    expect(state.written).toEqual({ prefs: { boot_video_seen: true } })
  })

  /**
   * THE SILENT ONE. supabase-js says `{ error: null }` for an UPDATE that
   * matched nothing, so without counting the returned rows this is
   * indistinguishable from success — and the consequence is a film that replays
   * on every visit for the rest of that account's life.
   */
  test('an update that matched NO ROW is reported, not swallowed', async () => {
    state.updatedRows = 0
    await expect(writeBootVideoSeen()).resolves.toBe('no-row')
  })

  test('no-row and saved are different answers', async () => {
    const ok = await writeBootVideoSeen()
    state.updatedRows = 0
    const none = await writeBootVideoSeen()
    expect(ok).not.toEqual(none)
  })

  test('a write error is failed', async () => {
    state.writeError = { code: '42501', message: 'permission denied' }
    await expect(writeBootVideoSeen()).resolves.toBe('failed')
  })

  test('a failed pre-read never writes', async () => {
    state.readError = { code: '57014', message: 'statement timeout' }
    await expect(writeBootVideoSeen()).resolves.toBe('failed')
    // The point: a merge built on a read that did not happen would write
    // `{ boot_video_seen: true }` alone and erase everything else.
    expect(state.written).toBeNull()
  })

  test('signed out never writes', async () => {
    state.userId = null
    await expect(writeBootVideoSeen()).resolves.toBe('failed')
    expect(state.written).toBeNull()
  })

  test('a thrown write is failed', async () => {
    state.throws = true
    await expect(writeBootVideoSeen()).resolves.toBe('failed')
  })
})
