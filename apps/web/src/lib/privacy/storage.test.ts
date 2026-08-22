/**
 * The file walk and the file sweep, against a stand-in for Supabase Storage.
 *
 * ## What a stand-in can and cannot prove
 *
 * It can prove the two things that are actually easy to get wrong and invisible
 * when they are: that the walk RECURSES (Supabase's `list` is one directory deep
 * and every real key is three levels down), and that a failure is REPORTED
 * rather than rounded up into a success. Both are decided by this module's own
 * control flow, which a fake exercises exactly as a real bucket would.
 *
 * It cannot prove anything about the real service — that a `remove` which
 * answered 200 actually removed the object, or that the policies permit it. That
 * is stated in docs/38 §9 rather than left for somebody to assume.
 *
 * ## The fake behaves like the real one in the ONE way that matters
 *
 * A folder entry has `id: null` and an object entry does not. That is the only
 * thing separating them in a listing, and a walk that ignored it would return
 * folder names as if they were files — a sweep that then "removed" three paths,
 * reported success, and left every actual photograph in place.
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { sweepWorkspaceStorage, walkWorkspaceStorage } from './storage'

const WS = '11111111-2222-3333-4444-555555555555'

type Bucket = Record<string, string[]>

/**
 * A storage stand-in built from a flat list of keys.
 *
 * `list(prefix)` returns the immediate children of that prefix, marking a child
 * that has children of its own as a folder — which is what the real service
 * does, and which is why the walk has to recurse.
 */
function fakeStorage(
  buckets: Record<string, string[]>,
  options: {
    failList?: (bucket: string, prefix: string) => string | null
    failRemove?: (bucket: string, paths: string[]) => string | null
    /** Refuse to actually remove, while reporting success. The silent case. */
    removeIsALie?: boolean
  } = {},
) {
  const state: Bucket = { ...buckets }
  const removed: string[] = []

  const client = {
    storage: {
      from(bucket: string) {
        return {
          list(prefix: string, opts: { limit: number; offset: number }) {
            const failure = options.failList?.(bucket, prefix)
            if (failure) return Promise.resolve({ data: null, error: { message: failure } })

            const children = new Map<string, boolean>() // name -> isFolder
            for (const key of state[bucket] ?? []) {
              if (!key.startsWith(`${prefix}/`)) continue
              const rest = key.slice(prefix.length + 1)
              const slash = rest.indexOf('/')
              if (slash === -1) children.set(rest, false)
              else children.set(rest.slice(0, slash), true)
            }
            const entries = [...children.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(opts.offset, opts.offset + opts.limit)
              .map(([name, isFolder]) => ({
                name,
                id: isFolder ? null : `id-${name}`,
                updated_at: '2026-08-23T00:00:00.000Z',
                metadata: isFolder ? null : { size: 10, mimetype: 'image/jpeg' },
              }))
            return Promise.resolve({ data: entries, error: null })
          },
          remove(paths: string[]) {
            const failure = options.failRemove?.(bucket, paths)
            if (failure) return Promise.resolve({ data: null, error: { message: failure } })
            removed.push(...paths)
            if (!options.removeIsALie) {
              state[bucket] = (state[bucket] ?? []).filter((k) => !paths.includes(k))
            }
            return Promise.resolve({ data: [], error: null })
          },
        }
      },
    },
  }
  return { client: client as unknown as SupabaseClient, removed, state }
}

const FIXTURE = {
  media: [
    `${WS}/library/photo-a.jpg`,
    `${WS}/library/photo-b.jpg`,
    `${WS}/derivatives/asset-1/crop-1.jpg`,
    `${WS}/derivatives/asset-1/crop-2.jpg`,
    `${WS}/post-9/inline.png`,
    `${WS}/knowledge/menu.pdf`,
    // Another tenant's folder, in the same bucket. Nothing here may touch it.
    `99999999-9999-4999-8999-999999999999/library/not-ours.jpg`,
  ],
  'brand-assets': [`${WS}/logo.svg`],
}

describe('walking a workspace’s files', () => {
  it('finds objects three levels down, not folder names one level down', async () => {
    const { client } = fakeStorage(FIXTURE)
    const walk = await walkWorkspaceStorage(client, WS)
    expect(walk.objects.map((o) => o.path).sort()).toEqual([
      `${WS}/derivatives/asset-1/crop-1.jpg`,
      `${WS}/derivatives/asset-1/crop-2.jpg`,
      `${WS}/knowledge/menu.pdf`,
      `${WS}/library/photo-a.jpg`,
      `${WS}/library/photo-b.jpg`,
      `${WS}/logo.svg`,
      `${WS}/post-9/inline.png`,
    ])
    // Never a folder. `library` and `derivatives` are not files, and a sweep
    // handed those three names would remove nothing and report success.
    expect(walk.objects.map((o) => o.path)).not.toContain(`${WS}/library`)
  })

  it('never leaves its own workspace’s prefix', async () => {
    const { client } = fakeStorage(FIXTURE)
    const walk = await walkWorkspaceStorage(client, WS)
    expect(walk.objects.every((o) => o.path.startsWith(`${WS}/`))).toBe(true)
  })

  it('carries size and type through, and both buckets', async () => {
    const { client } = fakeStorage(FIXTURE)
    const walk = await walkWorkspaceStorage(client, WS)
    expect(new Set(walk.objects.map((o) => o.bucket))).toEqual(new Set(['media', 'brand-assets']))
    expect(walk.objects[0]?.bytes).toBe(10)
    expect(walk.objects[0]?.mime).toBe('image/jpeg')
  })

  it('REPORTS a folder it could not list rather than treating it as empty', async () => {
    // The export's whole shape: an unreadable folder that reported nothing would
    // be indistinguishable from a customer who has no files.
    const { client } = fakeStorage(FIXTURE, {
      failList: (bucket, prefix) =>
        prefix.endsWith('/library') && bucket === 'media' ? 'network reset' : null,
    })
    const walk = await walkWorkspaceStorage(client, WS)
    expect(walk.unreadable).toHaveLength(1)
    expect(walk.unreadable[0]?.reason).toContain('network reset')
    // And it keeps going: one bad folder must not cost the customer the rest.
    expect(walk.objects.length).toBeGreaterThan(3)
  })

  it('pages through a folder with more than one page of files', async () => {
    const many = Array.from(
      { length: 250 },
      (_, i) => `${WS}/library/f${String(i).padStart(3, '0')}.jpg`,
    )
    const { client } = fakeStorage({ media: many, 'brand-assets': [] })
    const walk = await walkWorkspaceStorage(client, WS)
    expect(walk.objects).toHaveLength(250)
  })
})

describe('sweeping a workspace’s files', () => {
  it('removes every one of them and nobody else’s', async () => {
    const { client, state } = fakeStorage(FIXTURE)
    const result = await sweepWorkspaceStorage(client, WS)
    expect(result.failed).toEqual([])
    expect(result.removed).toBe(7)
    expect(state.media).toEqual([`99999999-9999-4999-8999-999999999999/library/not-ours.jpg`])
    expect(state['brand-assets']).toEqual([])
  })

  it('NAMES a file it could not remove, and does not round up to success', async () => {
    // This is what stops the erasure: the action refuses to touch the database
    // while any file is still there.
    const { client } = fakeStorage(FIXTURE, {
      failRemove: (bucket) => (bucket === 'brand-assets' ? 'forbidden' : null),
    })
    const result = await sweepWorkspaceStorage(client, WS)
    expect(result.failed.map((f) => f.path)).toEqual([`${WS}/logo.svg`])
    expect(result.failed[0]?.reason).toContain('forbidden')
  })

  it('stops when a removal reports success and removes nothing', async () => {
    // The silent case, and the reason the loop counts PROGRESS rather than
    // passes: a `remove` that answers 200 and does nothing would otherwise spin
    // until the pass ceiling and then report a number of files it never removed.
    const { client } = fakeStorage(FIXTURE, { removeIsALie: true })
    const result = await sweepWorkspaceStorage(client, WS)
    expect(result.failed.length).toBeGreaterThan(0)
    expect(result.failed.every((f) => f.reason.includes('still present'))).toBe(true)
  })

  it('is idempotent — a second sweep of an empty prefix is a no-op', async () => {
    // The property the whole storage-first ordering rests on. A customer whose
    // first attempt failed halfway must be able to press the button again.
    const { client } = fakeStorage(FIXTURE)
    await sweepWorkspaceStorage(client, WS)
    const second = await sweepWorkspaceStorage(client, WS)
    expect(second).toEqual({ removed: 0, failed: [], leftUnread: [] })
  })

  it('does not report success while a folder is unreadable', async () => {
    // A folder that could not be LISTED holds files that were not removed. The
    // action treats `leftUnread` exactly as it treats `failed`.
    const { client } = fakeStorage(FIXTURE, {
      failList: (bucket, prefix) =>
        bucket === 'media' && prefix.endsWith('/derivatives') ? 'timed out' : null,
    })
    const result = await sweepWorkspaceStorage(client, WS)
    expect(result.leftUnread.length).toBeGreaterThan(0)
  })
})
