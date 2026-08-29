import type { Palette } from '@sahoda/shared'

import { DesignPreview } from '@/components/studio/design-preview'
import { StartFromTemplate } from '@/components/studio/start-from-template'
import type { DesignListRead } from '@/lib/studio/read'
import { templateShelf } from '@/lib/studio/template-copy'

/**
 * THE WORKSPACE'S OWN STARTING POINTS.
 *
 * A design somebody ticked a box on, shown so it can be used. Pressing one
 * writes a NEW design carrying the same words and pictures and opens it; the
 * starting point itself is untouched, which is the difference between this and
 * the toggle in the editor, and why both sentences name which happened.
 *
 * ── A SERVER COMPONENT, AND THE BUILD IS WHY ────────────────────────────────
 * The previews render here, on the server, exactly as the gallery beside them
 * does. The first draft of this file was `'use client'` and `next build`
 * answered with `/studio 683.6 kB > 594.5 kB budget (+89.1 kB)`: the renderer
 * followed the component into the browser. `start-from-template.tsx` is the
 * only part that needed to cross, and it takes the finished preview as a child.
 *
 * ── FOUR NOTHINGS, AS EVERYWHERE ELSE IN THIS PRODUCT ───────────────────────
 * A read that failed is not an empty shelf. The empty state is the ONLY one
 * that says "you have none", and the only one that explains how to make one,
 * because a shelf empty for any other reason cannot be filled by following
 * that instruction.
 */
export function StartingPoints({ read, palette }: { read: DesignListRead; palette: Palette }) {
  const shelf = templateShelf(
    read.status === 'ok'
      ? { status: 'ok', designs: read.designs, unreadable: read.unreadable }
      : { status: read.status },
  )

  // Nothing to show and nothing to explain: this account has no workspace, and
  // the gallery below already says so once. Saying it twice on one screen is
  // noise rather than honesty.
  if (shelf.kind === 'no-workspace') return null

  return (
    <section aria-labelledby="studio-starting-points" className="flex flex-col gap-3">
      <div>
        <h2 id="studio-starting-points" className="type-h2">
          Your starting points
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Designs you keep to begin from. Starting one makes a new design and leaves the original
          alone.
        </p>
      </div>

      {shelf.kind === 'unreadable' ? (
        <p role="alert" className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
          {shelf.message}
        </p>
      ) : shelf.kind === 'empty' ? (
        <p className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">{shelf.body}</p>
      ) : (
        <div className="grid gap-3 wide:grid-cols-4 max-wide:grid-cols-2">
          {read.status === 'ok' &&
            read.designs.map((design) => (
              <StartFromTemplate key={design.id} designId={design.id} title={design.title}>
                <DesignPreview
                  templateId={design.doc.templateId}
                  page={design.doc.pages[0]!}
                  presetId={design.preset_id}
                  palette={palette}
                  className="transition-micro group-hover:opacity-90"
                />
              </StartFromTemplate>
            ))}
        </div>
      )}
    </section>
  )
}
