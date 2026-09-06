import { decideOrphans, type StorageObject } from './decide'

/**
 * The orphan sweep over the private `media` bucket: per workspace, list
 * `<ws>/assets/` and `<ws>/derivatives/`, keep whatever an `assets` or
 * `asset_derivatives` row names, and remove the rest once it is older than an
 * hour.
 *
 * ── WHY ONLY THOSE TWO PREFIXES ──────────────────────────────────────────────
 * Direct post uploads live at `<ws>/<postId>/<objectId>.<ext>`, and their rows
 * (`post_media`) cascade away with the post. `deletePost` removes those objects
 * itself, before the cascade takes the paths with it (DB-19); this sweep does
 * not know a post id from a folder and stays out of that tree on purpose.
 *
 * ── DRY-RUN BY DEFAULT ───────────────────────────────────────────────────────
 * The mode comes from `SAHODA_STORAGE_RECONCILE`, and only the exact word
 * `delete` removes anything. Every other value, including absence, lists and
 * decides and logs counts — which is what the first runs against production
 * should be, because a decision function is proven on fixtures and a bucket is
 * not a fixture.
 */

export type StorageReconcileMode = 'dry-run' | 'delete'

export interface StorageReconcileDeps {
  mode: StorageReconcileMode
  listWorkspaceIds(): Promise<string[]>
  /** Every object under `prefix`, recursively, with whatever age the listing carries. */
  listObjects(prefix: string): Promise<StorageObject[]>
  /** Every `storage_path` an `assets` or `asset_derivatives` row names, for one workspace. */
  listKnownPaths(workspaceId: string): Promise<Set<string>>
  removeObjects(paths: string[]): Promise<void>
  now?(): Date
  /** Counts and prefixes only. Never a customer value. */
  log?(line: string): void
}

export interface StorageReconcileReport {
  mode: StorageReconcileMode
  workspaces: number
  /** Objects listed across every prefix. */
  scanned: number
  referenced: number
  tooYoung: number
  unknownAge: number
  /** What the decision function would remove. Equal to `deleted` only in `delete` mode. */
  orphans: number
  deleted: number
  /** Workspaces whose listing or read threw. The others still ran. */
  failedWorkspaces: number
}

/** The two trees this sweep owns, under a workspace. */
export const RECONCILED_FOLDERS = ['assets', 'derivatives'] as const

/** `SAHODA_STORAGE_RECONCILE=delete` is the only value that removes anything. */
export function storageReconcileMode(
  source: NodeJS.ProcessEnv = process.env,
): StorageReconcileMode {
  return source.SAHODA_STORAGE_RECONCILE === 'delete' ? 'delete' : 'dry-run'
}

export async function runStorageReconcile(
  deps: StorageReconcileDeps,
): Promise<StorageReconcileReport> {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? (() => {})

  const report: StorageReconcileReport = {
    mode: deps.mode,
    workspaces: 0,
    scanned: 0,
    referenced: 0,
    tooYoung: 0,
    unknownAge: 0,
    orphans: 0,
    deleted: 0,
    failedWorkspaces: 0,
  }

  const workspaceIds = await deps.listWorkspaceIds()
  report.workspaces = workspaceIds.length

  for (const workspaceId of workspaceIds) {
    try {
      const objects: StorageObject[] = []
      for (const folder of RECONCILED_FOLDERS) {
        objects.push(...(await deps.listObjects(`${workspaceId}/${folder}/`)))
      }
      const knownPaths = await deps.listKnownPaths(workspaceId)
      const decision = decideOrphans({ objects, knownPaths, now: now() })

      report.scanned += objects.length
      report.referenced += decision.referenced
      report.tooYoung += decision.tooYoung
      report.unknownAge += decision.unknownAge
      report.orphans += decision.delete.length

      if (decision.delete.length > 0 && deps.mode === 'delete') {
        await deps.removeObjects(decision.delete)
        report.deleted += decision.delete.length
      }

      log(
        `[storage-reconcile] ${deps.mode}: scanned=${objects.length} referenced=${decision.referenced} ` +
          `tooYoung=${decision.tooYoung} unknownAge=${decision.unknownAge} orphans=${decision.delete.length}`,
      )
    } catch (error) {
      // One workspace's bucket or rows being unreadable is not a reason to skip
      // the rest. It IS a reason to say so: a sweep that silently covered fewer
      // workspaces than it claimed would be a count nobody could trust.
      report.failedWorkspaces += 1
      log(
        `[storage-reconcile] workspace skipped: ${error instanceof Error ? error.message : 'error'}`,
      )
    }
  }

  return report
}
