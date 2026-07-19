/**
 * Draft -> deployable bundle. `renderBundle` is the ONLY supported way to turn a draft into
 * HTML, and that is what keeps the escaping gate unbypassable: every path to markup runs
 * through `renderDocument` and the section renderers it calls, so there is no second route by
 * which model-generated copy can reach a customer's origin unescaped. Nothing else in this
 * module is exported.
 *
 * File names come from {@link pathToFile} -- the committed traversal guard -- and never from a
 * name invented here. `styles.css` ships beside the pages; `<head>` inlines tokens and the
 * theme custom properties (they must resolve before first paint) while the sheet carries layout
 * only, so the two do not duplicate each other.
 *
 * ## Every returned bundle satisfies the deployer's invariants
 *
 * `fixtureDeployer` refuses a bundle with no `index.html`, with duplicate paths, or with a
 * directory/file collision -- and it refuses it IN FULL. So emitting one of those does not cost
 * a broken page; it costs a deploy in which every page's bytes are discarded, reported at the
 * deploy boundary, attributed to the deployer, long after and far away from the real defect.
 * Both refusable shapes are therefore caught here instead:
 *
 *  - **path conflicts** via {@link findBundlePathConflict}, the SAME function the deployer
 *    uses, so the two cannot drift apart. `pathToFile` proves two distinct normalized page
 *    paths can never collide, so the only shape that reaches this in practice is one path
 *    claimed twice in `draft.pages`. `normalizeDraft` dedupes, so that means a hand-built
 *    draft -- a programming error, and one whose consequence is a page silently overwritten.
 *  - **no entry document**, i.e. no page at `/`. This throws where the plan emitted a
 *    stylesheet-only bundle. A lone stylesheet is not a site, and `normalizeDraft` cannot
 *    produce `pages: []` (it errors instead), so that shape is hand-built too.
 *
 * A missing `/` page, unlike the other two, IS reachable from real model output: nothing in
 * `normalizeDraft` requires a home page. The honest fix belongs there, where it would land in
 * `dropped` and reach the founder as a report. Until it does, this throw is the last place the
 * defect can be named at all -- and it names it ("no page at /") rather than leaving the
 * deployer to say "bundle has no index.html" about a bundle the caller never assembled.
 *
 * Failures are throws, not a `Result`, for consistency with the two guards already on this
 * path: `pathToFile` throws on an unnormalized path and `renderDocument` throws on injected CSS
 * that would close the `<style>` block. All three are programming errors with no partial output
 * worth returning.
 *
 * Untrusted values are reported by POSITION, never echoed -- a page path reaches the logs and
 * the UI. The same line `fixture.ts` and `bundle-paths.ts` already hold.
 */
import { createHash } from 'node:crypto'
import type { SiteDraft } from '../normalize/draft'
import { pathToFile } from '../normalize/path'
import { findBundlePathConflict } from '../deploy/bundle-paths'
import type { BundleFile, SiteBundle } from '../deploy/port'
import type { RenderContext } from './context'
import { renderDocument, renderStylesheet } from './document'

const STYLESHEET_FILE = 'styles.css'
const ENTRY_FILE = 'index.html'
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8'
const CSS_CONTENT_TYPE = 'text/css; charset=utf-8'
const HASH_ALGORITHM = 'sha256'
const DIGEST_ENCODING = 'hex'
const FRAME_DELIMITER = ':'

/**
 * Length-prefixed framing, in place of the plan's NUL/SOH separators.
 *
 * A separator-delimited serialization is unambiguous only while the separator cannot occur in
 * the data. `path` and `contentType` satisfy that by construction, but `content` does not:
 * `ctx.tokensCss` is caller-injected and reaches the document verbatim (CSS cannot be
 * HTML-escaped without corrupting it, so `renderDocument` rejects only the `</style` sequence),
 * so a control byte CAN appear inside a hashed field. Framing each field with its own length is
 * unambiguous whatever the bytes are, and the failure it forecloses is the one this hash exists
 * to prevent: two distinct file sets sharing one bundleId, i.e. a genuine edit that reads as a
 * no-op downstream and never redeploys.
 *
 * **This guard is deliberately redundant, in the sense `normalize/path.ts` documents for its
 * own three.** Replacing `frame` with the identity function leaves this package's suite green,
 * and that is expected rather than an oversight: forging a collision also needs control over a
 * `path`, and every path here comes from `pathToFile`, whose output is `index.html` or
 * `<normalized>/index.html` and nothing else. No test claims to pin this line. Do not delete it
 * on the strength of a passing suite -- the constraint that makes it unreachable lives in
 * another module, and `tokensCss` is a caller-controlled field flowing into a hashed one.
 *
 * A secondary benefit: it keeps control characters out of this package's source entirely, which
 * has twice been how a file here regressed to a binary blob git cannot diff.
 */
const frame = (value: string): string => `${value.length}${FRAME_DELIMITER}${value}`

/**
 * Sorted so the digest is a function of the file SET, not of the order the pages arrived in --
 * reordering pages changes nothing a visitor is served, so it must not force a redeploy. Every
 * field is framed, so the concatenation of the sorted records parses back uniquely.
 */
const stableSerialize = (files: readonly BundleFile[]): string =>
  files
    .map((file) => `${frame(file.path)}${frame(file.contentType)}${frame(file.content)}`)
    .sort()
    .join('')

const hashFiles = (files: readonly BundleFile[]): string =>
  createHash(HASH_ALGORITHM).update(stableSerialize(files), 'utf8').digest(DIGEST_ENCODING)

/**
 * Throws unless the assembled names can all coexist as files under one directory.
 *
 * The stylesheet is checked ALONGSIDE the pages, not after them, because it is one of the two
 * shapes that can actually conflict. `/styles.css` is a path `normalizePath` accepts -- the
 * segment is plainly `[a-z0-9._-]` and is not a reserved name -- so a generation containing it
 * yields the file `styles.css/index.html`, which asks the writer for a DIRECTORY named
 * `styles.css` beside the FILE `styles.css`. Checking pages alone would have shipped that
 * bundle for the deployer to refuse in full.
 */
const assertWritable = (paths: readonly string[], stylesheetIndex: number): void => {
  const conflict = findBundlePathConflict(paths)
  if (conflict !== null) {
    // Positions, not paths: the caller can resolve a position against the draft it supplied,
    // and a log reader must not be handed an untrusted string. `styles.css` is this module's
    // own constant rather than caller input, so naming it costs nothing and saves the caller
    // hunting for a position that corresponds to no page.
    throw new Error(
      conflict.index === stylesheetIndex
        ? `renderBundle: the page at position ${conflict.conflictsWith} collides with the emitted ${STYLESHEET_FILE} (${conflict.kind}); rename the page.`
        : `renderBundle: bundle entries at positions ${conflict.conflictsWith} and ${conflict.index} conflict (${conflict.kind}); one page would overwrite another.`,
    )
  }
  if (!paths.includes(ENTRY_FILE)) {
    throw new Error(
      `renderBundle: the draft has no page at /, so the bundle would have no ${ENTRY_FILE} and nothing to open. Refusing to build it.`,
    )
  }
}

/**
 * `draft.name` and `draft.goal` are deliberately NOT read: the name a document renders is
 * `ctx.siteName`, injected by the caller alongside the tokens and the canonical origin, and
 * `goal` reaches the site only through the sections the generator already produced. Reading
 * `draft.name` here would make two competing sources of the site's name. `page.sort` is not
 * read either -- `normalizeDraft` orders `pages`, and re-sorting here would be a second
 * ordering authority.
 */
export const renderBundle = (draft: SiteDraft, ctx: RenderContext): SiteBundle => {
  const pages: BundleFile[] = draft.pages.map((page) => ({
    // `pathToFile` is evaluated BEFORE `renderDocument`, so the traversal guard fires before any
    // markup is built. Today `renderDocument` calls it too (via `stylesheetHref`), which makes
    // the ORDER unobservable and this line's guard un-mutation-killable: hand-rolling
    // `page.path.slice(1) + '/index.html'` here leaves the suite green, because the throw simply
    // arrives from the other call instead. That equivalence is a property of `renderDocument`,
    // not a property of this module, and it is the wrong thing to depend on -- the bundle's own
    // filename must come from the package's one traversal guard whatever the document does.
    path: pathToFile(page.path),
    content: renderDocument(page, ctx),
    contentType: HTML_CONTENT_TYPE,
  }))

  const stylesheet: BundleFile = {
    path: STYLESHEET_FILE,
    content: renderStylesheet(ctx),
    contentType: CSS_CONTENT_TYPE,
  }

  const files: BundleFile[] = [...pages, stylesheet]
  assertWritable(
    files.map((file) => file.path),
    pages.length,
  )

  return { files, bundleId: hashFiles(files) }
}
