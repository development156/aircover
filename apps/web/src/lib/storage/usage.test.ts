import { beforeEach, describe, expect, it, vi } from 'vitest'

import { storageState } from '@sahoda/shared'

/**
 * The four answers, kept apart.
 *
 * The whole value of this module is that it never says "0 bytes used" unless it
 * read a zero. Every other outcome is a different sentence, and a meter that
 * flattened them would make a claim about a customer's own files on no evidence.
 */

const state = vi.hoisted(() => ({
  data: null as unknown,
  error: null as { code?: string; message?: string } | null,
  throws: false,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: async () => {
      if (state.throws) throw new Error('network died')
      return { data: state.data, error: state.error }
    },
  }),
}))

const { readStorageUsage, storageRefusal } = await import('./usage')

const WS = '11111111-1111-4111-8111-111111111111'
const MB = 1_000_000
const GB = 1_000_000_000

beforeEach(() => {
  state.data = 0
  state.error = null
  state.throws = false
})

describe('readStorageUsage', () => {
  it('reports a real figure', async () => {
    state.data = 400 * MB

    const usage = await readStorageUsage(WS)

    expect(usage).toEqual({ kind: 'ok', state: storageState(400 * MB) })
  })

  it('reads a bigint that arrived as a string', async () => {
    // PostgREST serialises bigint as a string past 2^53, and `Number('...')`
    // handles it. Pinned because a silent NaN here would read as a failed read.
    state.data = '734000000'

    const usage = await readStorageUsage(WS)

    expect(usage.kind).toBe('ok')
    if (usage.kind === 'ok') expect(usage.state.usedBytes).toBe(734_000_000)
  })

  it('a missing function is NOT a read failure and NOT zero', async () => {
    // Between this code landing and the migration being applied, the function does
    // not exist. That is a condition only we can act on, so it gets its own answer
    // rather than a scary sentence or a false empty bar.
    for (const error of [
      { code: '42883', message: 'function public.workspace_storage_bytes(uuid) does not exist' },
      { code: 'PGRST202', message: 'Could not find the function' },
    ]) {
      state.error = error
      expect((await readStorageUsage(WS)).kind, error.code).toBe('not_deployed')
    }
  })

  it('a real error is a read failure, never zero', async () => {
    state.error = { code: '42501', message: 'not a member of this workspace' }

    expect((await readStorageUsage(WS)).kind).toBe('read_failed')
  })

  it('a thrown transport error is a read failure', async () => {
    state.throws = true

    expect((await readStorageUsage(WS)).kind).toBe('read_failed')
  })

  it('null and empty are read failures, because Number() would make them zero', async () => {
    // `Number(null)` is 0 and `Number('')` is 0. Both would render as a perfectly
    // healthy empty library, which is the exact lie this module exists to avoid.
    for (const value of [null, undefined, '']) {
      state.data = value
      expect((await readStorageUsage(WS)).kind, String(value)).toBe('read_failed')
    }
  })

  it('no workspace is its own answer', async () => {
    expect(await readStorageUsage(null)).toEqual({ kind: 'no_workspace' })
  })
})

describe('storageRefusal', () => {
  const ok = (used: number) => ({ kind: 'ok', state: storageState(used) }) as const

  it('refuses the file that would cross the line, naming size, free space and the trash', async () => {
    const refusal = storageRefusal(ok(950 * MB), 100 * MB)

    expect(refusal).toContain('100 MB')
    expect(refusal).toContain('50 MB left')
    expect(refusal).toContain('1 GB')
    // The trash sentence is load-bearing: trashed files still occupy the
    // allowance, so "delete some files" alone sends someone to do a thing that
    // changes the number by nothing.
    expect(refusal).toContain('trash')
    expect(refusal).toContain('nothing was uploaded')
  })

  it('a full workspace gets the sentence that does not quote a remaining figure', async () => {
    // "0 MB left" is arithmetic; "has used all of its 1 GB" is the claim.
    const refusal = storageRefusal(ok(GB), 1)

    expect(refusal).toContain('used all of its 1 GB')
    expect(refusal).not.toContain('0 MB left')
  })

  it('lets a file that fits through', async () => {
    expect(storageRefusal(ok(500 * MB), 100 * MB)).toBeNull()
  })

  it('FAILS OPEN when usage could not be read', async () => {
    // Deliberate. Refusing every upload in the product because one query failed
    // turns a reporting fault into an outage, and every file is capped at 4 MB
    // anyway, so nothing can run away while the read is broken.
    for (const kind of ['read_failed', 'not_deployed', 'no_workspace'] as const) {
      expect(storageRefusal({ kind }, 900 * MB), kind).toBeNull()
    }
  })
})
