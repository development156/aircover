/**
 * The CROSS-FILE half of the bundle path contract.
 *
 * `isBundleFilePath` is pure and per-path by deliberate design -- making it collision-aware
 * would require it to see every other entry in the bundle and then invent a disambiguated
 * name, which is the silent coercion `normalize/path.ts` exists to refuse. The cost of that
 * design is that it cannot see a conflict BETWEEN two names, and every name it accepts is
 * still joined onto one host directory. That check has to live somewhere, and this is it.
 *
 * Two accepted names fail to coexist in exactly two ways:
 *
 *  - **duplicate** -- they are the same string, so the second write overwrites the first and
 *    the first entry's bytes are discarded. Silent discard is what the house rules forbid.
 *  - **directory-file** -- one is a directory prefix of the other, so the writer is asked for
 *    a file `a` and a directory `a`. `normalizePath` proves this cannot arise between two
 *    PAGES (it rejects any segment equal to `index.html`, the only way one `.../index.html`
 *    can prefix another), but `isBundleFilePath` also admits bare asset names like `a`, and
 *    `a` prefixes `a/index.html`. The proof does not extend to the wider accepted set.
 *
 * Both are reported by POSITION rather than by name: the paths are untrusted input that
 * reaches the UI and the logs, and the two guards already in `fixture.ts` hold that same line.
 * A caller holding the bundle can resolve a position to a path; a log reader must not be
 * handed one.
 */

const SEPARATOR = '/'

/** Which of the two ways the pair fails to coexist. */
export type BundlePathConflictKind = 'duplicate' | 'directory-file'

/**
 * A conflicting pair. `conflictsWith` is always the EARLIER position, so a report is stable
 * regardless of which of the two the scan happened to reach first.
 */
export interface BundlePathConflict {
  kind: BundlePathConflictKind
  index: number
  conflictsWith: number
}

const conflictOf = (kind: BundlePathConflictKind, a: number, b: number): BundlePathConflict => ({
  kind,
  index: Math.max(a, b),
  conflictsWith: Math.min(a, b),
})

/**
 * Every proper directory prefix of `path`, longest first. `a/b/c` yields `a/b` then `a`.
 * Longest-first so a conflict is attributed to the NEAREST shadowing entry, which is the one
 * the caller most likely mistyped.
 */
const ancestorsOf = (path: string): string[] => {
  const segments = path.split(SEPARATOR)
  const ancestors: string[] = []
  for (let count = segments.length - 1; count > 0; count -= 1) {
    ancestors.push(segments.slice(0, count).join(SEPARATOR))
  }
  return ancestors
}

/**
 * The first pair of entries in `paths` that cannot both exist as files under one directory,
 * or `null` when the bundle is writable as given.
 *
 * Duplicates are reported before shadowing when a bundle has both, purely so the result is
 * deterministic: the caller fixes one defect, re-submits, and reaches the second report.
 *
 * Duplicates are rejected even when the two entries carry identical content. Nothing here
 * proves they agree -- `contentType` may differ and the writer is asked for the same name
 * twice either way -- and a content-comparison special case would only narrow the rule in the
 * one shape where the mistake is harmless.
 */
export const findBundlePathConflict = (paths: readonly string[]): BundlePathConflict | null => {
  const firstIndexOf = new Map<string, number>()

  for (const [index, path] of paths.entries()) {
    const seen = firstIndexOf.get(path)
    if (seen !== undefined) {
      return conflictOf('duplicate', index, seen)
    }
    firstIndexOf.set(path, index)
  }

  for (const [index, path] of paths.entries()) {
    for (const ancestor of ancestorsOf(path)) {
      const shadowing = firstIndexOf.get(ancestor)
      if (shadowing !== undefined) {
        return conflictOf('directory-file', index, shadowing)
      }
    }
  }

  return null
}
