import { describe, it, expect, vi } from 'vitest'

import { ORPHAN_MIN_AGE_MS, type StorageObject } from './decide'
import { runStorageReconcile, storageReconcileMode, type StorageReconcileDeps } from './reconcile'

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-06T12:00:00.000Z')
const old = new Date(NOW.getTime() - 2 * ORPHAN_MIN_AGE_MS).toISOString()

function deps(over: Partial<StorageReconcileDeps> = {}) {
  const removed: string[][] = []
  const listed: string[] = []
  const buckets: Record<string, StorageObject[]> = {
    [`${WS_A}/assets/`]: [
      { path: `${WS_A}/assets/kept.png`, createdAt: old },
      { path: `${WS_A}/assets/orphan.png`, createdAt: old },
    ],
    [`${WS_A}/derivatives/`]: [{ path: `${WS_A}/derivatives/x/orphan.jpg`, createdAt: old }],
    [`${WS_B}/assets/`]: [],
    [`${WS_B}/derivatives/`]: [],
  }
  const d: StorageReconcileDeps = {
    mode: 'dry-run',
    listWorkspaceIds: async () => [WS_A, WS_B],
    listObjects: async (prefix) => {
      listed.push(prefix)
      return buckets[prefix] ?? []
    },
    listKnownPaths: async (ws) => new Set(ws === WS_A ? [`${WS_A}/assets/kept.png`] : []),
    removeObjects: async (paths) => {
      removed.push(paths)
    },
    now: () => NOW,
    ...over,
  }
  return { deps: d, removed, listed }
}

describe('runStorageReconcile', () => {
  it('lists both trees of every workspace', async () => {
    const { deps: d, listed } = deps()

    await runStorageReconcile(d)

    expect(listed).toEqual([
      `${WS_A}/assets/`,
      `${WS_A}/derivatives/`,
      `${WS_B}/assets/`,
      `${WS_B}/derivatives/`,
    ])
  })

  it('in dry-run it counts the orphans and removes NOTHING', async () => {
    const { deps: d, removed } = deps()

    const report = await runStorageReconcile(d)

    expect(report).toMatchObject({
      mode: 'dry-run',
      workspaces: 2,
      scanned: 3,
      referenced: 1,
      orphans: 2,
      deleted: 0,
    })
    expect(removed).toEqual([])
  })

  it('in delete mode it removes exactly the decision list, per workspace', async () => {
    const { deps: d, removed } = deps({ mode: 'delete' })

    const report = await runStorageReconcile(d)

    expect(removed).toEqual([[`${WS_A}/assets/orphan.png`, `${WS_A}/derivatives/x/orphan.jpg`]])
    expect(report.deleted).toBe(2)
  })

  it('a workspace that cannot be read is skipped and counted, and the rest still run', async () => {
    const log = vi.fn()
    const { deps: d, removed } = deps({
      mode: 'delete',
      listKnownPaths: async (ws) => {
        if (ws === WS_A) throw new Error('rows unreadable')
        return new Set()
      },
      log,
    })

    const report = await runStorageReconcile(d)

    // WS_A's orphans are NOT deleted: with its rows unreadable, every object
    // would have looked like an orphan. That is the whole reason a failed read
    // skips the workspace instead of deciding on an empty set.
    expect(removed).toEqual([])
    expect(report.failedWorkspaces).toBe(1)
    expect(report.workspaces).toBe(2)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('workspace skipped'))
  })

  it('never removes an object younger than the guard, even in delete mode', async () => {
    const fresh = new Date(NOW.getTime() - 60_000).toISOString()
    const { deps: d, removed } = deps({
      mode: 'delete',
      listObjects: async (prefix) =>
        prefix === `${WS_A}/assets/`
          ? [{ path: `${WS_A}/assets/fresh.png`, createdAt: fresh }]
          : [],
    })

    const report = await runStorageReconcile(d)

    expect(removed).toEqual([])
    expect(report).toMatchObject({ tooYoung: 1, orphans: 0, deleted: 0 })
  })
})

describe('storageReconcileMode', () => {
  it('is dry-run unless the flag says exactly delete', () => {
    expect(storageReconcileMode({})).toBe('dry-run')
    expect(storageReconcileMode({ SAHODA_STORAGE_RECONCILE: 'on' })).toBe('dry-run')
    expect(storageReconcileMode({ SAHODA_STORAGE_RECONCILE: 'true' })).toBe('dry-run')
    expect(storageReconcileMode({ SAHODA_STORAGE_RECONCILE: 'DELETE' })).toBe('dry-run')
    expect(storageReconcileMode({ SAHODA_STORAGE_RECONCILE: 'delete' })).toBe('delete')
  })
})
