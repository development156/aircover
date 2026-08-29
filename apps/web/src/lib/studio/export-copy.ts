/**
 * WHAT HAPPENS WHEN A DESIGN IS EXPORTED TWICE, AND WHAT THE PERSON IS TOLD.
 *
 * ── THE TRAP THIS EXISTS TO DISARM ──────────────────────────────────────────
 * The renderer is deterministic: the same design exported twice produces
 * byte-identical PNGs, asserted by sha256 in `raster.test.ts`. The assets
 * library refuses a duplicate by content hash. So without this module, pressing
 * the button a second time would be answered with an upload refusal, and if the
 * first export had been trashed the person would be told to restore a file they
 * have never heard of.
 *
 * Refusing is right for an upload and wrong here. Exporting the same design
 * again is not a mistake, it is somebody pressing a button again, and the honest
 * answer is where the picture already is.
 *
 * ── THREE OUTCOMES, AND THE MIDDLE ONE IS NOT AN ERROR ──────────────────────
 * store     nothing in this workspace holds these bytes. Upload, and record it.
 * linked    the bytes are already a live file. Point at it. Nothing is stored
 *           twice and nothing is charged twice.
 * in-trash  the bytes are in the trash. Restoring is the remedy that works;
 *           exporting again would pay for the same file a second time.
 *
 * The `linked` arm covers TWO situations with one sentence, on purpose: this
 * design was exported before, or an identical picture arrived some other way.
 * The claim "this design is already in your library" is true in both, because
 * the bytes ARE the design.
 *
 * Pure: no I/O, no clock, no database.
 */

/** A file in this workspace whose bytes are the ones about to be exported. */
export type ExistingCopy = {
  assetId: string
  title: string | null
  /** Set when the file is in the trash. A trashed file is present, not absent. */
  trashedAt: string | null
}

export type ExportPlan =
  | { kind: 'store' }
  | { kind: 'linked'; assetId: string; message: string }
  | { kind: 'in-trash'; assetId: string; message: string }

/**
 * A file's own name, quoted, or null when it has none.
 *
 * The curly quotes are deliberate typography around content a person typed, not
 * an AI tell: the copy rules call that out by name. A file with no title is not
 * given an invented one, because "saved as untitled" is a claim about a name
 * that does not exist.
 */
function named(title: string | null): string | null {
  const trimmed = title === null ? '' : title.trim()
  return trimmed === '' ? null : `“${trimmed}”`
}

/** Decide what exporting these bytes should do, given what the workspace already holds. */
export function planExport(existing: ExistingCopy | null): ExportPlan {
  if (existing === null) return { kind: 'store' }

  const label = named(existing.title)

  if (existing.trashedAt !== null) {
    return {
      kind: 'in-trash',
      assetId: existing.assetId,
      message:
        label === null
          ? 'This design is in your trash. Restore it there to use the picture. Sahoda did not store a second copy.'
          : `This design is in your trash, saved as ${label}. Restore it there to use the picture. Sahoda did not store a second copy.`,
    }
  }

  return {
    kind: 'linked',
    assetId: existing.assetId,
    message:
      label === null
        ? 'This design is already in your library.'
        : `This design is already in your library, saved as ${label}.`,
  }
}

/** What the person is told when the picture has just been stored. */
export const EXPORT_STORED = 'Added to your library.'

/**
 * Refusals, and each says what state the design is in rather than that something
 * went wrong. `unrenderable` is our defect and says so; the other two are things
 * about the design that a person can act on.
 */
export const EXPORT_REFUSALS = {
  notFound: 'That design is not in this workspace.',
  unreadable: 'This design could not be opened, so nothing was exported.',
  unrenderable:
    'This design could not be turned into a picture. Nothing was added to your library, and the problem is at our end rather than yours.',
  // Says which KIND of nothing: the design is fine and one of its pictures is
  // not readable. "This design could not be exported" would send somebody to
  // look at the words when the problem is the photograph.
  missingPhoto:
    'One of the pictures in this design could not be read, so it was not added to your library. It may have been deleted.',
  failed: 'This design could not be added to your library. Nothing was stored.',
} as const

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPORTING A WHOLE CAROUSEL.
 *
 * ── A SLIDE THAT FAILS DOES NOT UNDO THE ONES THAT WORKED ───────────────────
 * Each slide is its own file. There is nothing to roll back, and rolling back
 * would be the wrong act anyway: deleting four good pictures because the fifth
 * would not draw destroys work over a problem the person can fix.
 *
 * So the only thing that matters is that the sentence afterwards is EXACT about
 * which slides reached the library and which did not. "Some slides could not be
 * added" is the failure this module exists to prevent: a person cannot act on
 * it, and they cannot tell whether to press again.
 */

/** What happened to one slide. `ok: false` carries the reason that slide gave. */
export type PageExport =
  | { pageIndex: number; ok: true; outcome: 'stored' | 'already' | 'in-trash'; assetId: string }
  | { pageIndex: number; ok: false; message: string }

/** Slide numbers as a person counts them, from 1, joined the way a sentence needs. */
function listSlides(pages: readonly PageExport[]): string {
  const numbers = pages.map((page) => page.pageIndex + 1)
  if (numbers.length === 1) return `${numbers[0]}`
  const last = numbers[numbers.length - 1]
  return `${numbers.slice(0, -1).join(', ')} and ${last}`
}

/**
 * What the person is told after exporting every slide.
 *
 * The claims kept apart, because each sends somebody somewhere different:
 *   stored     new files are in the library
 *   already    those slides were already there, and nothing was stored twice
 *   in-trash   the file exists, in the trash, and restoring is the remedy
 *   failed     that slide is NOT in the library, with the reason it gave
 */
export function describeBatchExport(pages: readonly PageExport[]): string {
  if (pages.length === 0) return EXPORT_REFUSALS.unreadable

  const stored = pages.filter((page) => page.ok && page.outcome === 'stored')
  const already = pages.filter((page) => page.ok && page.outcome === 'already')
  const trashed = pages.filter((page) => page.ok && page.outcome === 'in-trash')
  const failed = pages.filter((page) => !page.ok)

  // The commonest case, said plainly rather than counted at somebody.
  if (stored.length === pages.length) {
    return pages.length === 1
      ? EXPORT_STORED
      : `All ${pages.length} slides were added to your library.`
  }

  const parts: string[] = []
  if (stored.length > 0) {
    parts.push(
      stored.length === 1
        ? `Slide ${listSlides(stored)} was added to your library.`
        : `Slides ${listSlides(stored)} were added to your library.`,
    )
  }
  if (already.length > 0) {
    parts.push(
      already.length === 1
        ? `Slide ${listSlides(already)} was already there, so nothing was stored twice.`
        : `Slides ${listSlides(already)} were already there, so nothing was stored twice.`,
    )
  }
  if (trashed.length > 0) {
    parts.push(
      trashed.length === 1
        ? `Slide ${listSlides(trashed)} is in your trash. Restore it there to use the picture.`
        : `Slides ${listSlides(trashed)} are in your trash. Restore them there to use the pictures.`,
    )
  }
  if (failed.length > 0) {
    // The reason is carried through when every failure gave the same one.
    // Two different reasons become a list of slide numbers rather than one
    // reason presented as if it covered both.
    const reasons = new Set(failed.map((page) => (page.ok ? '' : page.message)))
    const shared = reasons.size === 1 ? [...reasons][0] : null
    parts.push(
      failed.length === 1
        ? `Slide ${listSlides(failed)} was not added. ${shared ?? ''}`.trim()
        : `Slides ${listSlides(failed)} were not added.${shared === undefined || shared === null ? '' : ` ${shared}`}`,
    )
  }

  return parts.join(' ')
}

/**
 * What one exported slide is called in the library.
 *
 * A single-page design keeps its own name. A carousel does not: ten files all
 * called "Diwali offer" is a library nobody can use, and the number is the only
 * thing that tells them apart. It is the position a person sees in the editor,
 * counting from 1.
 */
export function titleForPage(designTitle: string, pageIndex: number, pageCount: number): string {
  const base = designTitle.trim() === '' ? 'Design' : designTitle.trim()
  if (pageCount <= 1) return base
  // The column allows 120 characters and the suffix has to survive, so the name
  // is trimmed rather than the number dropped.
  const suffix = ` (slide ${pageIndex + 1})`
  return `${base.slice(0, 120 - suffix.length)}${suffix}`
}
