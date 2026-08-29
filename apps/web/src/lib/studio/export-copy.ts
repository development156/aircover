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
  failed: 'This design could not be added to your library. Nothing was stored.',
} as const
