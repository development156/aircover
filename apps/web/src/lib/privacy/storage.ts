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
 * ## It re-walks between passes, and the re-walk is the MEASUREMENT
 *
 * Not a cursor. Each pass deletes what it listed, so the remainder shifts down
 * and an advancing offset would step straight over it — the mistake
 * `removeDerivativeObjects` already documents in `actions/assets.ts`.
 *
 * The re-walk is also how progress is counted, and that is the important half.
 * Counting the paths handed to `remove` counts what the SERVICE CLAIMED. A
 * backend that answers 200 and removes nothing — which is what a policy change
 * looks like from this side — would then be reported as a complete sweep, the
 * erasure would go ahead, and the customer's photographs would still be sitting
 * in the bucket. MEASURED by a test: the first version of this function did
 * exactly that, and reported 140 files removed from a bucket it never touched.
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
  const failed = new Map<string, string>()
  let leftUnread: StorageWalk['unreadable'] = []
  let removed = 0

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const walk = await walkWorkspaceStorage(supabase, workspaceId)
    leftUnread = walk.unreadable
    if (walk.objects.length === 0) {
      return {
        removed,
        failed: [...failed].map(([path, reason]) => ({ path, reason })),
        leftUnread,
      }
    }

    for (const bucket of CUSTOMER_BUCKETS) {
      const paths = walk.objects.filter((o) => o.bucket === bucket).map((o) => o.path)
      if (paths.length === 0) continue
      const { error } = await supabase.storage.from(bucket).remove(paths)
      // KEYED BY PATH, not appended. A bucket that refuses is retried on the
      // next pass and refuses again, so a list would carry the same file once
      // per pass — and the action turns `failed.length` into a sentence. One
      // stuck file would have told the customer "20 of your files could not be
      // deleted", which is both wrong and frightening.
      if (error) for (const path of paths) failed.set(path, error.message)
    }

    // PROGRESS IS MEASURED BY WHAT DISAPPEARED, never by what `remove` claimed.
    //
    // A backend that answers 200 and removes nothing is not hypothetical — it is
    // what a policy change looks like from this side. Counting the paths handed
    // to `remove` would report every file deleted, hand the erasure a green
    // light, and leave the customer's photographs exactly where they were. So
    // the next walk is the measurement.
    const after = await walkWorkspaceStorage(supabase, workspaceId)
    const gone = walk.objects.length - after.objects.length
    removed += Math.max(0, gone)

    if (after.objects.length === 0) {
      return {
        removed,
        failed: [...failed].map(([path, reason]) => ({ path, reason })),
        leftUnread,
      }
    }
    if (gone <= 0) {
      // Nothing moved. Another identical pass would move nothing either.
      for (const object of after.objects) {
        if (!failed.has(object.path)) {
          failed.set(object.path, 'still present after a removal that reported success')
        }
      }
      return {
        removed,
        failed: [...failed].map(([path, reason]) => ({ path, reason })),
        leftUnread,
      }
    }
  }

  const remaining = await walkWorkspaceStorage(supabase, workspaceId)
  for (const object of remaining.objects) {
    if (!failed.has(object.path)) {
      failed.set(object.path, `still present after ${maxPasses} passes`)
    }
  }
  return {
    removed,
    failed: [...failed].map(([path, reason]) => ({ path, reason })),
    leftUnread: remaining.unreadable,
  }
}
