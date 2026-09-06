import type { Pool } from 'pg'

import { getRuntime } from '../runtime'
import type { StorageObject } from './decide'
import {
  storageReconcileMode,
  type StorageReconcileDeps,
  type StorageReconcileMode,
} from './reconcile'

/** Matches apps/web's `MEDIA_BUCKET` and publish/media.ts. One private bucket. */
const MEDIA_BUCKET = 'media'

/** Supabase Storage lists at most this many entries per call. */
const LIST_PAGE = 1000

/**
 * A folder only ever nests one level in the trees this sweep owns
 * (`derivatives/<assetId>/<file>`); a runaway listing is refused rather than
 * followed.
 */
const MAX_DEPTH = 4

export interface StorageReconcileDepsOptions {
  mode?: StorageReconcileMode
  fetchImpl?: typeof fetch
  log?: (line: string) => void
}

/** One entry of Storage's `object/list` response. Folders carry `id: null`. */
interface ListEntry {
  name: string
  id: string | null
  created_at?: string | null
}

/**
 * The storage REST calls, over the service-role key the runtime already holds.
 *
 * Straight `fetch` against `/storage/v1`, like `createStorageReader` in
 * publish/media.ts: no supabase-js in the jobs graph, and every failure is a
 * status code this code can name. The URL is never echoed on failure — it
 * carries the workspace id.
 */
export function createStorageLister(opts: {
  supabaseUrl: string
  serviceRoleKey: string
  fetchImpl?: typeof fetch
}) {
  const doFetch = opts.fetchImpl ?? fetch
  const origin = opts.supabaseUrl.replace(/\/+$/, '')
  const headers = {
    Authorization: `Bearer ${opts.serviceRoleKey}`,
    apikey: opts.serviceRoleKey,
    'content-type': 'application/json',
  }

  async function listOne(prefix: string, offset: number): Promise<ListEntry[]> {
    const res = await doFetch(`${origin}/storage/v1/object/list/${MEDIA_BUCKET}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prefix,
        limit: LIST_PAGE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    })
    if (!res.ok) throw new Error(`storage list returned ${res.status}`)
    const body: unknown = await res.json()
    if (!Array.isArray(body)) throw new Error('storage list returned a non-array')
    return body as ListEntry[]
  }

  /** Every object under `prefix` (a folder path ending in `/`), recursively. */
  async function listObjects(prefix: string, depth = 0): Promise<StorageObject[]> {
    if (depth > MAX_DEPTH) throw new Error('storage tree deeper than expected')
    const folder = prefix.replace(/\/+$/, '')
    const out: StorageObject[] = []
    for (let offset = 0; ; offset += LIST_PAGE) {
      const page = await listOne(folder, offset)
      for (const entry of page) {
        const path = `${folder}/${entry.name}`
        if (entry.id === null) {
          out.push(...(await listObjects(`${path}/`, depth + 1)))
        } else {
          out.push({ path, createdAt: entry.created_at ?? null })
        }
      }
      if (page.length < LIST_PAGE) break
    }
    return out
  }

  async function removeObjects(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const res = await doFetch(`${origin}/storage/v1/object/${MEDIA_BUCKET}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes: paths }),
    })
    if (!res.ok) throw new Error(`storage delete returned ${res.status}`)
  }

  return { listObjects, removeObjects }
}

/** The two row sets that make an object referenced. Trashed assets keep their row, so they are kept. */
export function createKnownPathReader(pool: Pool) {
  return async (workspaceId: string): Promise<Set<string>> => {
    const r = await pool.query<{ storage_path: string }>(
      `select storage_path from assets where workspace_id = $1
       union all
       select storage_path from asset_derivatives where workspace_id = $1`,
      [workspaceId],
    )
    return new Set(r.rows.map((row) => row.storage_path))
  }
}

export function storageReconcileDeps(opts: StorageReconcileDepsOptions = {}): StorageReconcileDeps {
  const { env, pool } = getRuntime()
  const storage = createStorageLister({
    supabaseUrl: env.supabaseUrl,
    serviceRoleKey: env.serviceRoleKey,
    fetchImpl: opts.fetchImpl,
  })

  return {
    mode: opts.mode ?? storageReconcileMode(),
    listWorkspaceIds: async () => {
      const r = await pool.query<{ id: string }>('select id from workspaces order by created_at')
      return r.rows.map((row) => row.id)
    },
    listObjects: storage.listObjects,
    listKnownPaths: createKnownPathReader(pool),
    removeObjects: storage.removeObjects,
    // No default sink. `reconcile.ts` treats an absent `log` as silence, and the
    // one runner that wants the per-line trace is `scripts/storage-reconcile.ts`,
    // which is a script and prints as its whole purpose. Defaulting to
    // `console.log` here put debug output in shipped library source for every
    // caller, including the Trigger.dev task, which wants the report and not a
    // stream of lines.
    log: opts.log,
  }
}
