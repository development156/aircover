import { appError, err, ok } from '@sahoda/shared'
import type { Result } from '@sahoda/shared'
import {
  appendHistory,
  MAX_URL_LENGTH,
  type DeployContext,
  type Deployer,
  type SiteBundle,
  type SiteDeployState,
} from './port'
import { isBundleFilePath } from '../normalize/path'
import { findBundlePathConflict } from './bundle-paths'
import { checkPersistableInputs } from './fixture-input'

const DEPLOYER_NAME = 'fixture' as const
const ENTRY_FILE = 'index.html'
const FILE_URL_SCHEME = 'file://'

/**
 * The exact shape `slugify` guarantees, restated as an acceptance test.
 *
 * Derived from `src/slug.ts`, not invented: `slugify` NFKD-folds, lowercases, collapses
 * every run of non-`[a-z0-9]` to a SINGLE hyphen, then trims edge hyphens -- so its output
 * is always alphanumeric runs joined by single hyphens with no hyphen at either end, or
 * `''`. `resolveSlug` then substitutes `site` for `''` and may append `-2`..`-9` or a
 * six-character lowercase-alphanumeric suffix, all of which this pattern still admits.
 *
 * Everything a hostile caller would need is therefore excluded by construction: `.`, `/`,
 * `\`, `~`, whitespace, control bytes, `%`, uppercase, and the empty string. `..` cannot
 * match because `.` is outside the character class.
 */
const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * A DNS label tolerates 63 characters and `sites.slug` becomes a subdomain, so 63 is the
 * real ceiling. `slugify` caps its root at 48 and the longest walk suffix adds 7, so no
 * slug this system produces comes near it -- the bound exists to stop a hand-wired caller
 * handing the filesystem a path it cannot represent.
 */
const SLUG_MAX_LENGTH = 63

/**
 * The longest `outDir` that CANNOT produce an unpersistable url.
 *
 * `port.ts` bounds every free string in the `sites.deploy` column and says why: "bounding only
 * `url` would have been a bound on one call site rather than on the column". The bound existed,
 * but nothing on the WRITE path applied it -- `SiteDeployStateSchema` is a reader's schema, and
 * the producer never ran it. So `outDir: '/' + 'd'.repeat(3000)` deployed `ok: true`, wrote the
 * files, and handed back a state carrying a 3024-character url that its own column rejects.
 *
 * Capping the emitted url after the fact would be the wrong shape twice over: it is discovered
 * after the bytes are on disk, and there is no honest way to shorten a filesystem url -- a
 * truncated path names a different file. So the bound moves to the one INPUT that can still be
 * corrected, and it is derived from the longest url this deployer can build rather than picked:
 * `file://` + outDir + `/` + the longest slug `isValidSlug` admits + `/` + `index.html`. Every
 * accepted `outDir` therefore yields a url within {@link MAX_URL_LENGTH} for EVERY accepted
 * slug, so the emitted url needs no check of its own.
 */
const OUT_DIR_JOIN_SEPARATORS = 2
const MAX_OUT_DIR_LENGTH =
  MAX_URL_LENGTH -
  FILE_URL_SCHEME.length -
  SLUG_MAX_LENGTH -
  ENTRY_FILE.length -
  OUT_DIR_JOIN_SEPARATORS

/** Writes one bundle file. Injected so the package never imports `node:fs`. */
export type WriteBundleFile = (path: string, content: string) => Promise<void>

export interface FixtureDeployerDeps {
  outDir: string
  writeFile: WriteBundleFile
  now?: () => Date
}

/**
 * Join a directory to a child with exactly one separator. Only the directory's TRAILING
 * slashes are touched, and only because `outDir` is package config where `/tmp/x` and
 * `/tmp/x/` mean the same directory. The child is never rewritten: every child reaching
 * here has already passed `isValidSlug` or `isBundleFilePath`, so there is nothing left to
 * "fix", and silently fixing an untrusted name is how two entries collide on one file.
 */
const joinPath = (dir: string, child: string): string => `${dir.replace(/\/+$/, '')}/${child}`

/** The length cap is checked FIRST so the pattern never runs on an unbounded string. */
const isValidSlug = (slug: string): boolean =>
  slug.length <= SLUG_MAX_LENGTH && VALID_SLUG.test(slug)

/**
 * A bundle entry is safe only once it is an OBJECT carrying a path `isBundleFilePath` accepts.
 * The object check is what stops `file.path` throwing on a `null`/`undefined` element;
 * `isBundleFilePath` itself already refuses a non-string path, so a path-less object is rejected
 * without a separate branch.
 */
const isValidBundleFile = (file: unknown): boolean =>
  typeof file === 'object' && file !== null && isBundleFilePath((file as { path?: unknown }).path)

const PATH_SEPARATOR = '/'

/** `.` and `..` are the two segments that make an absolute path stop meaning where it points. */
const TRAVERSAL_SEGMENTS: ReadonlySet<string> = new Set(['.', '..'])

/**
 * What `outDir` must BE, stated positively: an absolute POSIX path naming a directory strictly
 * BELOW the filesystem root, with no traversal and no empty interior segment.
 *
 * The previous guard tested `outDir.length === 0` on the rationale that an empty value "would
 * silently turn `<outDir>/<slug>` into the absolute `/<slug>`". That rationale describes an
 * OUTCOME, and `''` is not the only input that reaches it: `joinPath` strips trailing slashes,
 * so `'/'` and `'///'` also collapse to `''` and write `/<slug>` at the filesystem root. A
 * non-emptiness test cannot express "below the root"; requiring a shape can.
 *
 * Requiring the path to be ABSOLUTE closes a second defect at the same time. `file://` followed
 * by a relative path puts the first path element in the URL's AUTHORITY position, so
 * `outDir: 'out'` emitted `file://out/<slug>/index.html` -- host `out`, a well-formed URL that
 * passes `SiteDeployStateSchema` and is persisted as a live preview address resolving to
 * nothing. Every value accepted here starts with `/`, so the emitted URL always has three
 * slashes after the scheme and an empty authority.
 *
 * This is CONFIG, not user input, so it fails at construction rather than returning a `Result`:
 * there is no caller who can correct it at deploy time and no partial write worth attempting.
 *
 * The below-root check is DELIBERATELY REDUNDANT, in the sense `normalize/path.ts` documents
 * for its own guards: `'/'` collapses to `''`, whose sole segment is empty, so the segment
 * check below already rejects it and deleting the explicit test leaves this suite green. It is
 * retained because it is the only line that states the root rule outright, and because a future
 * loosening of the segment rule must not silently readmit the filesystem root. Do not delete it
 * on the strength of a passing suite -- verified: it is the one mutation here that survives
 * alone, and dropping it together with the segment check fails four tests.
 */
const isValidOutDir = (outDir: string): boolean => {
  if (!outDir.startsWith(PATH_SEPARATOR)) return false

  const withoutTrailing = outDir.replace(/\/+$/, '')
  if (withoutTrailing.length === 0) return false

  // The trailing-slash-stripped form is what `joinPath` puts into the url, so that is the string
  // the bound is measured on. See {@link MAX_OUT_DIR_LENGTH} for why the cap lives here.
  if (withoutTrailing.length > MAX_OUT_DIR_LENGTH) return false

  return withoutTrailing
    .slice(1)
    .split(PATH_SEPARATOR)
    .every((segment) => segment.length > 0 && !TRAVERSAL_SEGMENTS.has(segment))
}

/**
 * The DEFAULT deployer. It writes the bundle to a local directory and reports
 * `preview: true` with a `file://` URL. It NEVER claims a public URL -- "no fake links,
 * ever" is repeated in four canon docs and is the load-bearing constraint of this feature.
 * `ctx.baseDomain` is deliberately unread here: this deployer has no way to fabricate
 * a `https://<slug>.<domain>` address even by accident.
 *
 * EVERY untrusted name is validated BEFORE the first write, and there are two of them,
 * not one. `ctx.slug` and `bundle.files[].path` are both plain `string`s with no enforced
 * provenance that get concatenated into a HOST filesystem path, so `../../etc` in either
 * one would escape `outDir` through the caller's own writer. Task 17 (which would have
 * guaranteed every slug came from `resolveSlug`) and Task 14 (which would have guaranteed
 * every bundle came from `renderBundle`) are both unlanded, so today every value in both
 * fields is hand-wired by a caller. The slug is checked against the allowlist above; each
 * file path is checked by `isBundleFilePath`, which round-trips through the package's one
 * traversal guard in `normalize/path.ts` rather than restating what a safe path is.
 *
 * A bundle with no `index.html` is REJECTED rather than deployed. `url` is nullable and
 * `status` has a `'failed'` arm, so a "live with no url" state is expressible -- but it
 * would be a lie of a different shape: `status:'live'` asserts something is serving, and
 * a directory with no entry document serves nothing. Nor is it a provider failure, since
 * every write that was asked for succeeded. It is a malformed input, which is exactly what
 * the caller must be told, so it takes the same `VALIDATION_ERROR` path as a bad slug.
 */
export const createFixtureDeployer = (deps: FixtureDeployerDeps): Deployer => {
  if (!isValidOutDir(deps.outDir)) {
    // The value is NOT echoed even though it is config: it is a host path and this message
    // reaches the logs. See `isValidOutDir` for why the shape, not the length, is the test.
    throw new Error(
      `createFixtureDeployer requires an absolute outDir below the filesystem root, with no "." or ".." segment and at most ${MAX_OUT_DIR_LENGTH} characters`,
    )
  }

  return async (bundle: SiteBundle, ctx: DeployContext): Promise<Result<SiteDeployState>> => {
    // Resolved WITHOUT touching `ctx` as an object: when `ctx` is itself null/undefined/a
    // primitive, reading `ctx.traceId` to build the very error that reports it would throw the
    // leak we are closing. A missing trace degrades to '' rather than crashing the report.
    const traceId =
      typeof ctx === 'object' &&
      ctx !== null &&
      typeof (ctx as { traceId?: unknown }).traceId === 'string'
        ? (ctx as DeployContext).traceId
        : ''

    // Runs FIRST because it is the only guard that can see whether `bundle`/`ctx` are objects and
    // whether `bundle.files` is a list at all; every check below iterates it. See
    // `fixture-input.ts` for why the values it covers are checked before the write rather than
    // after.
    const problem = checkPersistableInputs(bundle, ctx)
    if (problem !== null) {
      return err(appError('VALIDATION_ERROR', problem.message, traceId, problem.details))
    }

    if (typeof ctx.slug !== 'string' || !isValidSlug(ctx.slug)) {
      // The rejected slug is NOT echoed: it is untrusted input and this message reaches
      // the UI and the logs. The shape requirement is the actionable part.
      return err(
        appError(
          'VALIDATION_ERROR',
          'Site slug must be lowercase letters, digits and single hyphens, with no leading or trailing hyphen.',
          ctx.traceId,
        ),
      )
    }

    // `file.path` on a `null`/`undefined` element threw out of the Promise; establish the OBJECT
    // before the read. A string/number/boolean/array/path-less element reads `.path` as
    // `undefined`, which `isBundleFilePath` already rejects, so those stay honest errs. The
    // position is reported, the value never echoed.
    const badPathIndex = bundle.files.findIndex((file) => !isValidBundleFile(file))
    if (badPathIndex !== -1) {
      // The offending path is NOT echoed, for the same reason the slug is not: it is
      // untrusted, it reaches the UI and the logs, and it may be a host path. The position
      // is enough for the caller to find the entry in the bundle it supplied.
      return err(
        appError(
          'VALIDATION_ERROR',
          'Bundle file paths must be relative names with no traversal, leading slash or empty segment.',
          ctx.traceId,
          { fileIndex: badPathIndex },
        ),
      )
    }

    // Per-path validation proves each NAME is safe; it cannot prove two names can coexist,
    // because it is pure and per-path on purpose. Without this, two entries called
    // `index.html` deployed `ok:true` and the first entry's bytes were discarded in silence.
    const conflict = findBundlePathConflict(bundle.files.map((file) => file.path))
    if (conflict !== null) {
      return err(
        appError(
          'VALIDATION_ERROR',
          conflict.kind === 'duplicate'
            ? 'Two bundle entries have the same path, so one would overwrite the other. Nothing was written.'
            : 'One bundle entry is a directory of another, so both cannot exist on a filesystem. Nothing was written.',
          ctx.traceId,
          { fileIndex: conflict.index, conflictsWithIndex: conflict.conflictsWith },
        ),
      )
    }

    if (!bundle.files.some((file) => file.path === ENTRY_FILE)) {
      return err(
        appError(
          'VALIDATION_ERROR',
          `Bundle has no ${ENTRY_FILE}, so there would be nothing to open. Nothing was written.`,
          ctx.traceId,
          { fileCount: bundle.files.length },
        ),
      )
    }

    const now = ctx.now ?? deps.now ?? (() => new Date())
    const siteDir = joinPath(deps.outDir, ctx.slug)

    for (const file of bundle.files) {
      try {
        await deps.writeFile(joinPath(siteDir, file.path), file.content)
      } catch (error: unknown) {
        // Stop at the first failure: a half-written directory served as a "preview" would
        // be its own dishonesty. Carry only the error NAME -- dependency error text can
        // embed absolute host paths and is persisted into sites.deploy.
        return err(
          appError('PROVIDER_ERROR', 'Could not write the preview bundle to disk.', ctx.traceId, {
            name: error instanceof Error ? error.name : 'unknown',
            path: file.path,
          }),
        )
      }
    }

    // `Date#toISOString` THROWS a RangeError on an invalid Date, and that throw would escape
    // `Promise<Result<SiteDeployState>>` -- the same envelope leak `isBundleFilePath` had for a
    // non-string path. The clock is injected, so an unusable reading is a caller's defect, not
    // this deployer's. The bytes are already written at this point and the report says so: the
    // deploy is reported FAILED rather than timestamped with a fabricated value.
    const reading = now()
    if (!Number.isFinite(reading.getTime())) {
      return err(
        appError(
          'PROVIDER_ERROR',
          'The injected clock returned an unusable time, so this deploy cannot be honestly timestamped. The bundle was written but no deploy state was recorded.',
          ctx.traceId,
        ),
      )
    }

    const deployedAt = reading.toISOString()
    const url = `${FILE_URL_SCHEME}${joinPath(siteDir, ENTRY_FILE)}`

    return ok({
      deployer: DEPLOYER_NAME,
      status: 'live',
      preview: true,
      url,
      bundleId: bundle.bundleId,
      scriptName: null,
      deployedAt,
      error: null,
      history: appendHistory(ctx.previous, {
        bundleId: bundle.bundleId,
        deployedAt,
        url,
        preview: true,
      }),
    })
  }
}
