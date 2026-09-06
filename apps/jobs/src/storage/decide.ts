/**
 * Which objects in the media bucket are orphans: row set vs object list.
 *
 * Pure, and exported so it can be tested without a bucket or a database. The
 * runner (`./reconcile`) lists and deletes; this decides, and the decision is the
 * only part that can be wrong in an interesting way.
 *
 * ── THE AGE GUARD IS NOT AN OPTIMISATION ─────────────────────────────────────
 * An upload writes the OBJECT first and the ROW second (`assets.ts`,
 * `posts-crop.ts`): a listing taken between the two sees a perfectly healthy
 * upload as an orphan. One hour is far past any upload's row-write, and an
 * object whose age the listing did not report is treated as young, never as
 * old — an unknown age is not evidence of anything.
 */

export interface StorageObject {
  /** Full bucket path, e.g. `<ws>/assets/<id>.png`. */
  path: string
  /** ISO timestamp from the listing, or null when the listing did not carry one. */
  createdAt: string | null
}

export interface OrphanDecision {
  /** Objects with no row behind them, older than the guard. Safe to remove. */
  delete: string[]
  /** Objects a row still names. */
  referenced: number
  /** Unreferenced, but younger than the guard: an upload may be mid-flight. */
  tooYoung: number
  /** Unreferenced, and the listing gave no age. Kept, never deleted. */
  unknownAge: number
}

/** One hour, in milliseconds. */
export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000

export function decideOrphans(args: {
  objects: readonly StorageObject[]
  knownPaths: ReadonlySet<string>
  now: Date
  minAgeMs?: number
}): OrphanDecision {
  const minAgeMs = args.minAgeMs ?? ORPHAN_MIN_AGE_MS
  const cutoff = args.now.getTime() - minAgeMs

  const decision: OrphanDecision = { delete: [], referenced: 0, tooYoung: 0, unknownAge: 0 }

  for (const object of args.objects) {
    if (args.knownPaths.has(object.path)) {
      decision.referenced += 1
      continue
    }
    const created = object.createdAt === null ? Number.NaN : Date.parse(object.createdAt)
    if (!Number.isFinite(created)) {
      decision.unknownAge += 1
      continue
    }
    if (created > cutoff) {
      decision.tooYoung += 1
      continue
    }
    decision.delete.push(object.path)
  }

  return decision
}
