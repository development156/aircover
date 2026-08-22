import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The customer's FILES, for both halves of DPDP: listing them for the export and
 * removing them for the erasure.
 *
 * ## Why this is its own module and not part of either caller
 *
 * A photo is personal data exactly as much as the row that points at it, and the
 * two halves of the law disagree about which is harder. The export has to be
 * able to say what files exist even when it cannot carry their bytes; the
 * erasure has to remove them even when nothing in the database remembers where
 * they were. Both need the same walk, and a walk written twice drifts.
 *
 * ## Every object lives under `<workspace_id>/`
 *
 * That is not a convention this file hopes for — it is the tenant boundary.
 * `storage.objects`' policies read `(storage.foldername(name))[1]` and compare
 * it to the caller's memberships, so an object outside that prefix is one this
 * member could not have written and cannot read. Listing the prefix therefore
 * IS listing what they own, and there is no second place to look.
 *
 * ## Why it recurses
 *
 * Supabase's `list` is one directory deep. The real keys are three levels down —
 * `<ws>/library/<asset>.jpg`, `<ws>/derivatives/<asset>/<id>.jpg`,
 * `<ws>/<post>/<object>.jpg` — so a single `list` at the root returns FOLDER
 * ENTRIES and nothing else. A sweep that took those names as paths would delete
 * nothing and report success, which is the failure this whole lane exists to
 * stop.
 */

/** Both private buckets. `qa-artifacts` is ours, not the customer's. */
export const CUSTOMER_BUCKETS = ['media', 'brand-assets'] as const

/** One page of a listing. Supabase's own default; stated so the loop can bound itself. */
const PAGE = 100

/**
 * How deep the walk goes, and how many pages it will take at one level.
 *
 * Both are real bounds rather than decoration: a `list` that keeps answering a
 * full page while `remove` quietly does nothing would otherwise spin forever,
 * and this code runs inside a request.
 */
const MAX_DEPTH = 6
const MAX_PAGES = 200

export interface StoredObject {
  readonly bucket: string
  /** The full key, including the workspace prefix. */
  readonly path: string
  readonly bytes: number | null
  readonly mime: string | null
  readonly updatedAt: string | null
}

export interface StorageWalk {
  readonly objects: StoredObject[]
  /**
   * Anything the walk could not read, by bucket and prefix, with the reason.
   *
   * Never swallowed into an empty list. A bucket that failed to list looks
   * exactly like a bucket with no files, and for an export that difference is
   * the whole point — see `export.ts`.
   */
  readonly unreadable: { bucket: string; prefix: string; reason: string }[]
  /** True when a bound above was reached, so the caller can say the list is partial. */
  readonly truncated: boolean
}

type Entry = {
  name?: unknown
  id?: unknown
  updated_at?: unknown
  metadata?: { size?: unknown; mimetype?: unknown } | null
}

/** A folder has no `id`. That is the only thing distinguishing it from an object. */
function isFolder(entry: Entry): boolean {
  return entry.id === null || entry.id === undefined
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Every object under one workspace's prefix, in both customer buckets. */
export async function walkWorkspaceStorage(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<StorageWalk> {
  const objects: StoredObject[] = []
  const unreadable: StorageWalk['unreadable'] = []
  let truncated = false
  let pages = 0

  for (const bucket of CUSTOMER_BUCKETS) {
    // Breadth-first, with the depth carried alongside — a recursive function
    // here would be shorter and would make the depth bound something you have to
    // trust rather than read.
    const queue: { prefix: string; depth: number }[] = [{ prefix: workspaceId, depth: 0 }]

    while (queue.length > 0) {
      const { prefix, depth } = queue.shift()!
      if (depth > MAX_DEPTH || pages >= MAX_PAGES) {
        truncated = true
        break
      }

      let offset = 0
      for (;;) {
        pages += 1
        if (pages > MAX_PAGES) {
          truncated = true
          break
        }

        const listed = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset })

        if (listed.error) {
          unreadable.push({ bucket, prefix, reason: listed.error.message })
          break
        }

        const entries = (listed.data ?? []) as Entry[]
        for (const entry of entries) {
          const name = asString(entry.name)
          if (name === null) continue
          const path = `${prefix}/${name}`
          if (isFolder(entry)) {
            queue.push({ prefix: path, depth: depth + 1 })
            continue
          }
          objects.push({
            bucket,
            path,
            bytes: asNumber(entry.metadata?.size),
            mime: asString(entry.metadata?.mimetype),
            updatedAt: asString(entry.updated_at),
          })
        }

        if (entries.length < PAGE) break
        // Listing only — nothing is being removed underneath this walk, so an
        // advancing offset is correct here. The sweep below is the opposite case
        // and says so.
        offset += PAGE
      }
    }
  }

  return { objects, unreadable, truncated }
}

export interface SweepResult {
  readonly removed: number
  /** Named. A file that survived an erasure is the residue this lane is about. */
  readonly failed: { path: string; reason: string }[]
  readonly leftUnread: StorageWalk['unreadable']
}

/**
 * Remove every object a workspace owns.
 *
 * Runs under the caller's own token, like everything else in `apps/web`: members
 * have a DELETE policy on their own prefix (`20260718000009_storage.sql`), so no
 * service role is needed and none exists.
 *
 * ## It re-walks between passes
 *
 * Not a cursor. Each pass deletes what it listed, so the remainder shifts down
 * and an advancing offset would step straight over it — the mistake
 * `removeDerivativeObjects` already documents in `actions/assets.ts`. The bound
 * is a count of passes, and it is a real bound: a loop that only stopped on an
 * empty listing would spin forever the day `remove` starts succeeding without
 * removing anything.
 *
 * ## What "failed" means to the caller
 *
 * It is not a partial success to be rounded up. The erasure calls this BEFORE
 * the database transaction precisely so that a file it could not remove stops
 * the whole thing — a customer told their data is gone, whose photographs are
 * still in a bucket, has been lied to.
 */
export async function sweepWorkspaceStorage(
  supabase: SupabaseClient,
  workspaceId: string,
  maxPasses = 20,
): Promise<SweepResult> {
  let removed = 0
  const failed: SweepResult['failed'] = []
  let leftUnread: StorageWalk['unreadable'] = []

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const walk = await walkWorkspaceStorage(supabase, workspaceId)
    leftUnread = walk.unreadable
    if (walk.objects.length === 0) return { removed, failed, leftUnread }

    let removedThisPass = 0
    for (const bucket of CUSTOMER_BUCKETS) {
      const paths = walk.objects.filter((o) => o.bucket === bucket).map((o) => o.path)
      if (paths.length === 0) continue
      const { error } = await supabase.storage.from(bucket).remove(paths)
      if (error) {
        for (const path of paths) failed.push({ path, reason: error.message })
        continue
      }
      removed += paths.length
      removedThisPass += paths.length
    }

    // No progress and objects still listed: something is refusing, and another
    // identical pass will refuse identically. Report rather than spin.
    if (removedThisPass === 0) {
      for (const object of walk.objects) {
        if (!failed.some((f) => f.path === object.path)) {
          failed.push({
            path: object.path,
            reason: 'still present after a removal that reported success',
          })
        }
      }
      return { removed, failed, leftUnread }
    }
  }

  return {
    removed,
    failed: [
      ...failed,
      {
        path: `${workspaceId}/…`,
        reason: `gave up after ${maxPasses} passes with files remaining`,
      },
    ],
    leftUnread,
  }
}
