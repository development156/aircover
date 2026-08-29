import Link from 'next/link'
import { Palette } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { DesignPreview } from '@/components/studio/design-preview'
import { StartDesign } from '@/components/studio/start-design'
import { StartingPoints } from '@/components/studio/starting-points'
import { activeThemeTokens } from '@/lib/brand/read-theme'
import { describePaletteFallback, studioPalette } from '@/lib/studio/palette'
import { describeUnreadableDesigns, studioEmptiness } from '@/lib/studio/emptiness'
import { readDesigns } from '@/lib/studio/read'
import { activeWorkspaceRead } from '@/lib/workspaces'

export const metadata = { title: 'Studio' }

/**
 * STUDIO — designs a person makes, keeps and comes back to.
 *
 * ── THIS SCREEN USED TO BE A DRAWING OF ITSELF ──────────────────────────────
 * Until 2026-08-28 it rendered inert tiles and said "nothing here renders yet",
 * which was true. Founder's ruling that day made it live. Every design below is
 * a row, and every preview is drawn by the SAME function that writes the
 * exported PNG — not a picture of a design, the design.
 *
 * ── THE PRODUCT POSITION IS UNCHANGED, AND IT IS WORTH RESTATING ────────────
 * FSD 3.4: editable text and image SLOTS in a locked layout, no free canvas.
 * That is not a shortcut, it is the trade: you cannot move a box, and nothing
 * you export can come out off-brand. The document schema enforces it rather
 * than a comment — there is nowhere in a saved design to put a position.
 *
 * ── THREE READS, THREE DIFFERENT SENTENCES ─────────────────────────────────
 * An empty gallery is NOT no workspace and NOT a read that failed. Flattening
 * them is how a studio holding forty designs tells its owner it is empty.
 */
export default async function StudioPage() {
  const workspace = await activeWorkspaceRead()

  // The theme read needs the workspace id, so it cannot join the same batch.
  // `activeWorkspaceRead` is `cache`d, so asking again costs nothing.
  // The starting points are a third INDEPENDENT read rather than a filter over
  // the first: `readDesigns` excludes them in SQL, so the two lists never share
  // rows and a cap applied to one cannot silently shorten the other.
  const [designs, tokens, templates] = await Promise.all([
    readDesigns(),
    workspace.status === 'ok' ? activeThemeTokens(workspace.workspace.id) : Promise.resolve(null),
    readDesigns({ templates: true }),
  ])

  const resolved = studioPalette(tokens)
  const emptiness = studioEmptiness(designs)
  const paletteNote = describePaletteFallback(resolved)

  return (
    <div className="space-y-grid">
      <PageTitle sub="Make the picture, not just the caption. Layouts that already know your colours, your type and your logo.">
        Studio
      </PageTitle>

      {paletteNote === null ? null : (
        <p className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
          {paletteNote}
        </p>
      )}

      <StartDesign />

      <StartingPoints read={templates} palette={resolved.palette} />

      <section aria-labelledby="studio-designs" className="flex flex-col gap-3">
        <h2 id="studio-designs" className="type-h2">
          Your designs
        </h2>

        {emptiness.kind === 'no-workspace' ? (
          <EmptyState
            icon={Palette}
            title={emptiness.title}
            body={emptiness.body}
            tip="Everything you make in Sahoda is kept per workspace, so two businesses never share a library."
          />
        ) : emptiness.kind === 'unreadable' ? (
          <p role="alert" className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
            {emptiness.message}
          </p>
        ) : emptiness.kind === 'empty' ? (
          <EmptyState
            icon={Palette}
            title={emptiness.title}
            body={emptiness.body}
            tip="A design is saved as you go, so you can close this and come back to it."
          />
        ) : (
          <>
            <div className="grid gap-3 wide:grid-cols-4 max-wide:grid-cols-2">
              {designs.status === 'ok' &&
                designs.designs.map((design) => (
                  <Link
                    key={design.id}
                    href={`/studio/${design.id}`}
                    className="group flex flex-col gap-2 rounded-card transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <DesignPreview
                      templateId={design.doc.templateId}
                      page={design.doc.pages[0]!}
                      presetId={design.preset_id}
                      palette={resolved.palette}
                      className="transition-micro group-hover:opacity-90"
                    />
                    <span className="type-body font-[550] group-hover:underline group-hover:underline-offset-2">
                      {design.title}
                    </span>
                    <span className="type-sm text-muted">
                      {design.doc.pages.length === 1
                        ? '1 page'
                        : `${design.doc.pages.length} pages`}
                    </span>
                  </Link>
                ))}
            </div>
            {describeUnreadableDesigns(emptiness.unreadable) === null ? null : (
              <p className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
                {describeUnreadableDesigns(emptiness.unreadable)}
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="studio-cost" className="surface-ring rounded-card bg-surface p-4">
        <h2 id="studio-cost" className="type-h3">
          Exports are free, because the renderer is ours
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          A PNG or JPEG costs nothing. Drawing it is our own code, not a model call, so there is
          nothing to charge for. Only the parts that call a model cost credits, and none of them are
          here yet.
        </p>
      </section>
    </div>
  )
}
