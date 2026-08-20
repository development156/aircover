/**
 * `SiteGenerateOutput` → `SiteDraft`.
 *
 * Enforces the six invariants the mesh prompt asserts but `SiteGenerateOutputSchema` does not
 * (design doc §4): unique paths, page count, non-empty pages, home leads with a hero, safe
 * paths, non-empty titles. Everything discarded is named in `dropped` so the UI can report it —
 * the only hard failures are a generation with no pages and one whose every page dropped, and
 * BOTH carry the labels on `AppError.details`, because a caller with no draft has nowhere else to
 * read them. Neither failure is allowed to be the branch that quietly eats `unusable-goal`.
 *
 * ## What `dropped` says
 *
 * | label | meaning |
 * | --- | --- |
 * | `unusable-name` | `options.name` had content but none of it survived coercion |
 * | `unusable-goal` | `options.goal` had content but none of it survived coercion |
 * | `invalid-path:pages[i]` | `normalizePath` refused the path; the page is gone |
 * | `duplicate-path:/x` | a later page claimed a path already taken by a survivor |
 * | `dropped-section:/x[i]:kind` | the section normalizer found nothing renderable |
 * | `refused-fabricated:/x[i]:kind` | the kind makes a claim the generator cannot source (`attested.ts`) |
 * | `/x[i]:key` | a key the section normalizer discarded, forwarded **verbatim** |
 * | `truncated-sections:/x:n` | sections past {@link MAX_SECTIONS_PER_PAGE}, never scanned |
 * | `empty-page:/x` | every section dropped, so the page would have rendered blank |
 * | `unusable-title:/x` | the title had content but none of it survived coercion |
 * | `unusable-seo-description:/x` | ditto for the meta description |
 * | `home-not-hero:/` | `/` does not lead with a hero; nothing was reordered |
 * | `truncated-pages:n` | survivors past `options.maxPages` |
 * | `unscanned-pages:n` | pages past {@link MAX_SOURCE_PAGES}, never scanned |
 *
 * The `/x[i]:key` form forwards the section normalizer's own vocabulary unchanged — `(root)`,
 * `items[3].body`, `items[+9]`, `(+8 unknown keys)`, `(raw: 2 unstorable)`, `(unnameable)`, and
 * a key name shortened by `labelToken` to `name...(+9936 chars)`. This module never re-counts or
 * re-words them; see `section-coerce.ts` for what they do and do not promise.
 *
 * ## A lost page takes its own labels with it
 *
 * Labels are held per page and only merged once the page's fate is known. A page removed by
 * `maxPages` contributes exactly one count and none of its per-key labels: telling a founder
 * "I dropped the tagline on /pricing" when /pricing is not in the site at all is noise, not
 * honesty. The same ruling the section normalizer applies to an unbuildable `items[i]`.
 * A page dropped as *empty* is the exception — its `dropped-section:` labels are the reason it
 * went, so they stay.
 *
 * A page's own *reason for going* always stays, even when that makes the label name a path the
 * finished site does not contain: if `/b` is claimed twice and the surviving `/b` is then removed
 * by `maxPages`, the reader sees `duplicate-path:/b` alongside `truncated-pages:n` for a `/b` that
 * is nowhere in the draft. That is the lesser evil. Suppressing it would delete the only record
 * that a second `/b` was ever sent, and a page vanishing with nothing said about it is exactly the
 * silent loss this module exists to prevent. The rule above governs a lost page's *per-key*
 * labels, which are noise without the page; it does not govern the label that explains the loss.
 *
 * ## Both caps bound the input, never the accumulator
 *
 * `MAX_SOURCE_PAGES` and `MAX_SECTIONS_PER_PAGE` bound entries **scanned**. A cap on survivors
 * never fires for a list whose entries are all unusable, so a malfunctioning generation with
 * 100k pages would be walked in full and named one by one. Same reasoning, and the same
 * count-bearing label shape, as `MAX_ITEMS` in `section-items.ts`.
 */
import { ok, err, appError } from '@sahoda/shared'
import type { Result, SiteGenerateOutput } from '@sahoda/shared'
import { fabricatedSection, isUnattestable } from './attested'
import { normalizePath } from './path'
import { coerceText, labelToken } from './section-coerce'
import { normalizeSection } from './section-content'
import type { NormalizedSection } from './section-content'

const HOME_PATH = '/'
const MIN_PAGES = 1
const EMPTY_PAGES_MESSAGE = 'The site generator returned no pages.'
const NO_USABLE_PAGES_MESSAGE = 'No page from the site generator survived normalization.'
const PAGES_NOT_ARRAY_MESSAGE =
  'The site generator output has no pages array, so there is nothing to normalize.'

/** Stands in for a page element that was not an object, so it carried no path to read. */
export const invalidPage = (index: number): string => `invalid-page:pages[${index}]`

/** Stands in for a page whose `sections` field was not a list; nothing on it could be scanned. */
export const invalidSections = (path: string): string => `invalid-sections:${path}`

/** Last-resort `<title>`, used only when `options.name` is itself unusable. Never blank. */
export const UNTITLED_SITE = 'Untitled site'

/** Reported when `options.name` carried content that no coercion could turn into copy. */
export const UNUSABLE_NAME = 'unusable-name'

/** Ditto for `options.goal`, which is stored on `sites.goal` and must not vanish quietly. */
export const UNUSABLE_GOAL = 'unusable-goal'

/** Most pages scanned from one generation. Far past any plan tier; this is a memory bound. */
export const MAX_SOURCE_PAGES = 64

/** Most sections scanned on one page. Generous for a marketing page; this is a memory bound. */
export const MAX_SECTIONS_PER_PAGE = 32

/** Stands in for the pages past {@link MAX_SOURCE_PAGES}, which are never scanned nor named. */
export const unscannedPages = (count: number): string => `unscanned-pages:${count}`

/** Stands in for the survivors removed by `options.maxPages`. */
export const truncatedPages = (count: number): string => `truncated-pages:${count}`

/** Stands in for the sections past {@link MAX_SECTIONS_PER_PAGE} on one page. */
export const truncatedSections = (path: string, count: number): string =>
  `truncated-sections:${path}:${count}`

export const unusableTitle = (path: string): string => `unusable-title:${path}`

export const unusableSeoDescription = (path: string): string => `unusable-seo-description:${path}`

export interface DraftPage {
  path: string
  title: string
  seoDescription: string | null
  sort: number
  sections: NormalizedSection[]
}

export interface SiteDraft {
  name: string
  goal: string | null
  pages: DraftPage[]
}

export interface NormalizeOptions {
  name: string
  goal?: string | null
  maxPages: number
  traceId: string
}

type OutputPage = SiteGenerateOutput['pages'][number]

/** A page and the labels it earned, or just the labels when the page did not survive. */
interface PageOutcome {
  page: Omit<DraftPage, 'sort'> | null
  dropped: string[]
}

/** True when the value carried something a founder could have written and we lost it. */
const hadContent = (raw: unknown): boolean =>
  typeof raw === 'string' ? raw.trim() !== '' : raw !== undefined && raw !== null

/**
 * Run the same gate section copy runs — control characters stripped, whitespace trimmed, over-cap
 * values rejected rather than truncated — and report only a value that had content to begin with.
 * Whitespace lost nothing a founder wrote, so a blank input is silent.
 */
const usable = (raw: unknown, dropped: string[], label: string): string | undefined => {
  const value = coerceText(raw)
  if (value === undefined && hadContent(raw)) dropped.push(label)
  return value
}

/**
 * `+Infinity` is the one non-finite value with an unambiguous reading — "no cap" — and honouring
 * it is safe because {@link MAX_SOURCE_PAGES} already bounds how many pages can reach here. The
 * alternative, clamping it to 1, turns the caller's own "unlimited" sentinel into the *maximum*
 * possible truncation. `NaN` and `-Infinity` carry no such reading and become {@link MIN_PAGES},
 * as does any sub-1 number; whatever that costs is reported as a truncation, never lost silently.
 */
const pageLimit = (raw: number): number => {
  if (raw === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
  return Number.isFinite(raw) ? Math.max(MIN_PAGES, Math.floor(raw)) : MIN_PAGES
}

/**
 * `sort` is the index among SURVIVING sections (contiguous — the mapper is the sole ordering
 * authority), while the `dropped` labels carry the SOURCE index so a human can find the
 * offending section in the raw model output.
 *
 * `section.kind` goes through `labelToken` before it is named, because it is the only field on
 * the entry that reaches a label without a gate of its own: `entry.path` is bounded and
 * allowlisted by `normalizePath`, `entry.title` and `entry.seo.description` by `coerceText`.
 * `kind` is typed `SectionKind` but arrives from a text column (see `section-content.ts`), and
 * an out-of-union `kind` is precisely the value this line names — so the ungated path was also
 * the only path it could take. `index` is an array position and `path` is already normalized.
 */
const normalizeSections = (
  sections: OutputPage['sections'],
  path: string,
  dropped: string[],
): NormalizedSection[] => {
  const scanned =
    sections.length > MAX_SECTIONS_PER_PAGE ? sections.slice(0, MAX_SECTIONS_PER_PAGE) : sections
  const kept: NormalizedSection[] = []

  scanned.forEach((section, index) => {
    // BEFORE the content normalizer, deliberately. A fabricated testimonial is refused for
    // what it claims, not for how well it is written — running the normalizer first would
    // make a well-formed invented quote reach `kept` on the day someone reorders these two
    // statements, and would report a perfectly-formed fabrication as "nothing renderable".
    // The reason is the point; see `attested.ts`.
    if (isUnattestable(section.kind)) {
      dropped.push(fabricatedSection(path, index, labelToken(section.kind)))
      return
    }

    const result = normalizeSection(section.kind, section.content, kept.length)
    if (result === null) {
      dropped.push(`dropped-section:${path}[${index}]:${labelToken(section.kind)}`)
      return
    }
    for (const key of result.dropped) dropped.push(`${path}[${index}]:${key}`)
    kept.push(result.section)
  })

  if (sections.length > scanned.length) {
    dropped.push(truncatedSections(path, sections.length - scanned.length))
  }
  return kept
}

/**
 * The checks are ordered cheapest-and-most-fatal first: a page whose path is refused or already
 * taken is gone whatever its sections say, so its sections are never normalized at all.
 */
const normalizePage = (
  entry: OutputPage,
  index: number,
  siteName: string,
  taken: ReadonlySet<string>,
): PageOutcome => {
  // The page element is the untrusted boundary too: a `null`/`undefined` entry threw at
  // `entry.path`, and a string/number/boolean/array read `.path` as `undefined`, which
  // `normalizePath` already refuses. Establishing the OBJECT first turns the throwing shapes
  // into the same honest drop the missing-path ones already took.
  if (typeof entry !== 'object' || entry === null) {
    return { page: null, dropped: [invalidPage(index)] }
  }

  const path = normalizePath(entry.path)
  if (path === null) return { page: null, dropped: [`invalid-path:pages[${index}]`] }
  if (taken.has(path)) return { page: null, dropped: [`duplicate-path:${path}`] }

  // `Array.isArray`, not a null check: `entry.sections` typed `[]` still arrives as anything, and
  // a string survives a null check only to die at `.forEach`. A non-list `sections` is a page
  // that could render nothing, so it is dropped and named -- the same fate as an empty page.
  if (!Array.isArray(entry.sections)) {
    return { page: null, dropped: [invalidSections(path)] }
  }

  const dropped: string[] = []
  const sections = normalizeSections(entry.sections, path, dropped)
  if (sections.length === 0) {
    dropped.push(`empty-page:${path}`)
    return { page: null, dropped }
  }

  const title = usable(entry.title, dropped, unusableTitle(path))
  const seoDescription = usable(entry.seo?.description, dropped, unusableSeoDescription(path))
  if (path === HOME_PATH && sections[0]?.section.kind !== 'hero') {
    dropped.push(`home-not-hero:${path}`)
  }

  return {
    page: { path, title: title ?? siteName, seoDescription: seoDescription ?? null, sections },
    dropped,
  }
}

export const normalizeDraft = (
  output: SiteGenerateOutput,
  options: NormalizeOptions,
): Result<{ draft: SiteDraft; dropped: string[] }> => {
  // Both caller-supplied strings are gated ahead of EVERY return in this function, not just the
  // happy one, so that both failure paths carry them: a caller with no draft has nowhere else to
  // learn its goal was eaten, and that is as true of `pages: []` as it is of a generation whose
  // every page dropped. Gating them below either return would eat them on that branch alone.
  const dropped: string[] = []
  const siteName = usable(options.name, dropped, UNUSABLE_NAME) ?? UNTITLED_SITE
  const goal = usable(options.goal, dropped, UNUSABLE_GOAL) ?? null

  // `output` is typed `SiteGenerateOutput` but arrives from the model unvalidated: `Schema` is a
  // reader's schema the producer never runs. `{pages:null}` threw at `.length`, and `{pages:'abc'}`
  // read a length of 3 and sliced to a string before dying at `.forEach` -- which is why the guard
  // is `Array.isArray`, not a null check. A bad shape is DATA here, so it takes the same Result
  // return the empty case does, still carrying the gated name/goal labels.
  const rawPages: unknown =
    typeof output === 'object' && output !== null
      ? (output as { pages?: unknown }).pages
      : undefined
  if (!Array.isArray(rawPages)) {
    return err(appError('VALIDATION_ERROR', PAGES_NOT_ARRAY_MESSAGE, options.traceId, { dropped }))
  }

  if (output.pages.length === 0) {
    return err(appError('VALIDATION_ERROR', EMPTY_PAGES_MESSAGE, options.traceId, { dropped }))
  }

  const limit = pageLimit(options.maxPages)
  const source =
    output.pages.length > MAX_SOURCE_PAGES ? output.pages.slice(0, MAX_SOURCE_PAGES) : output.pages

  const taken = new Set<string>()
  const outcomes: PageOutcome[] = []
  const survivors: Array<Omit<DraftPage, 'sort'>> = []

  source.forEach((entry, index) => {
    const outcome = normalizePage(entry, index, siteName, taken)
    outcomes.push(outcome)
    if (outcome.page === null) return
    taken.add(outcome.page.path)
    survivors.push(outcome.page)
  })

  // Merge in source order, skipping the survivors `maxPages` is about to remove.
  let survivorIndex = 0
  for (const outcome of outcomes) {
    if (outcome.page !== null) {
      const truncated = survivorIndex >= limit
      survivorIndex += 1
      if (truncated) continue
    }
    for (const label of outcome.dropped) dropped.push(label)
  }

  if (survivors.length > limit) dropped.push(truncatedPages(survivors.length - limit))
  if (output.pages.length > source.length) {
    dropped.push(unscannedPages(output.pages.length - source.length))
  }

  if (survivors.length === 0) {
    return err(appError('VALIDATION_ERROR', NO_USABLE_PAGES_MESSAGE, options.traceId, { dropped }))
  }

  const pages: DraftPage[] = survivors.slice(0, limit).map((page, sort) => ({ ...page, sort }))
  return ok({
    draft: { name: siteName, goal, pages },
    dropped,
  })
}
