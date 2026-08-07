import {
  DEPLOY_HISTORY_LIMIT,
  MAX_TEXT_LENGTH,
  SiteDeployHistoryEntrySchema,
  type DeployContext,
  type SiteBundle,
} from './port'

/**
 * The pre-flight a deployer runs BEFORE its first write.
 *
 * `fixture.ts` already refused every input that could put bytes in the wrong PLACE -- a slug or
 * a file path that escapes `outDir`, two names that cannot coexist, a bundle with no entry
 * document. It did not refuse the inputs that make the RESULT unpersistable, and those fail
 * later and worse: the files are on disk, `ok: true` is returned, and `SiteDeployStateSchema`
 * rejects the state the caller is holding. A success-shaped result carrying a value its own
 * column refuses is the mock-success the house rules forbid, so the check has to run before the
 * write rather than after it.
 *
 * ## Where the invariant belongs
 *
 * The deployer's contract is now stated as: **every state it returns `ok` with satisfies
 * `SiteDeployStateSchema`.** That invariant is discharged in three places, chosen by who can
 * still fix the value at the time it is checked:
 *
 *  - `outDir` is CONFIG, so it is bounded in `fixture.ts` at CONSTRUCTION and throws. It is one
 *    of the two strings that build `url`, and no caller can correct it at deploy time.
 *  - `bundle.bundleId` and `ctx.previous` are PER-REQUEST, so they are checked here and returned
 *    as a `Result`. A caller can supply a different bundle.
 *  - `url` itself needs no check: `outDir` is bounded so that `file://<outDir>/<slug>/index.html`
 *    fits `MAX_URL_LENGTH` for the LONGEST slug `isValidSlug` admits, which makes the emitted
 *    url short by construction rather than by inspection.
 *
 * Values are reported by LENGTH or by POSITION, never echoed: `bundleId` is model-adjacent data
 * that reaches the logs, and a history entry may carry a host path in its `url`.
 */

/** What went wrong, in the shape `appError` wants. The value itself is never included. */
export interface DeployInputProblem {
  message: string
  details: Record<string, number>
}

/**
 * The entries `appendHistory` will actually KEEP. Validating the whole of `ctx.previous` would
 * fail a deploy over a stale entry that the cap evicts and no caller ever sees again -- a false
 * failure. `appendHistory` prepends one entry and slices to {@link DEPLOY_HISTORY_LIMIT}, so the
 * survivors are exactly this prefix.
 */
const survivingHistoryOf = (previous: readonly unknown[]): readonly unknown[] =>
  previous.slice(0, DEPLOY_HISTORY_LIMIT - 1)

/**
 * A problem with the per-request inputs whose values are copied verbatim into the returned
 * state, or `null` when the state this deploy would produce is persistable.
 *
 * Both parameters are typed but not trusted, for the reason `fixture.ts` documents: Task 14 and
 * Task 17 have not landed, so nothing enforces that a bundle came from `renderBundle` or that a
 * history came from a previous run of this deployer.
 */
export const checkPersistableInputs = (
  bundle: SiteBundle,
  ctx: DeployContext,
): DeployInputProblem | null => {
  // Both parameters are typed but hand-wired by a caller (Task 14/17 unlanded), so `deployer(null,
  // ctx)` and `deployer(bundle, null)` reach here as non-objects. Establish each is an object
  // BEFORE any property read: `null.files`/`null.previous` throw out of the Result envelope
  // otherwise. An array passes `typeof 'object'` and is left to the `Array.isArray` checks below,
  // which reject it honestly (`[].files`/`[].previous` are `undefined`).
  if (typeof bundle !== 'object' || bundle === null) {
    return { message: 'Bundle must be an object with a files array.', details: {} }
  }

  if (typeof ctx !== 'object' || ctx === null) {
    return { message: 'Deploy context must be an object.', details: {} }
  }

  if (!Array.isArray(bundle.files)) {
    return { message: 'Bundle files must be an array of entries.', details: {} }
  }

  if (typeof bundle.bundleId !== 'string') {
    return { message: 'Bundle id must be a string.', details: {} }
  }

  if (bundle.bundleId.length > MAX_TEXT_LENGTH) {
    // The id is copied into BOTH the state and the new history entry, so an over-long one makes
    // the row unpersistable twice over. The length is actionable; the value is not echoed.
    return {
      message: `Bundle id must be at most ${MAX_TEXT_LENGTH} characters, because it is persisted into sites.deploy.`,
      details: { bundleIdLength: bundle.bundleId.length, maxLength: MAX_TEXT_LENGTH },
    }
  }

  if (!Array.isArray(ctx.previous)) {
    return { message: 'Previous deploy history must be an array of entries.', details: {} }
  }

  const surviving = survivingHistoryOf(ctx.previous)
  for (const [index, entry] of surviving.entries()) {
    if (!SiteDeployHistoryEntrySchema.safeParse(entry).success) {
      // Reported by POSITION for the same reason a bad bundle path is: a history entry carries a
      // url, and for the fixture deployer that url is a path on someone's disk.
      return {
        message:
          'A previous deploy history entry does not satisfy the sites.deploy schema, so the updated history could not be persisted.',
        details: { historyIndex: index },
      }
    }
  }

  return null
}
