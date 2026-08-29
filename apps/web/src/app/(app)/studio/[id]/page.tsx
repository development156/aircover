import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { DesignEditor } from '@/components/studio/design-editor'
import { activeThemeTokens } from '@/lib/brand/read-theme'
import { describePaletteFallback, studioPalette } from '@/lib/studio/palette'
import { readDesign, readStudioPhotos } from '@/lib/studio/read'
import { activeWorkspaceRead } from '@/lib/workspaces'

export const metadata = { title: 'Design' }

/**
 * One design, open for editing.
 *
 * ── "NOT FOUND" AND "COULD NOT BE READ" ARE DIFFERENT PAGES ─────────────────
 * A design that is not in this workspace is a 404, which is the honest answer:
 * as far as this person is concerned it does not exist. A design that IS there
 * and will not parse is NOT a 404 — telling somebody their work is missing when
 * it is merely unreadable is the worse of the two wrong answers, and it is the
 * one that makes a person stop trusting the product.
 */
export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workspace = await activeWorkspaceRead()

  // One batch, three independent reads. The pictures are read here rather than
  // inside the editor because a client component cannot read the library, and
  // sequentially would make opening a design wait for a list it may not use.
  const [read, tokens, photos] = await Promise.all([
    readDesign(id),
    workspace.status === 'ok' ? activeThemeTokens(workspace.workspace.id) : Promise.resolve(null),
    readStudioPhotos(),
  ])

  if (read.status === 'not-found') notFound()

  const resolved = studioPalette(tokens)
  const paletteNote = describePaletteFallback(resolved)

  return (
    <div className="space-y-grid">
      <Link
        href="/studio"
        className="inline-flex items-center gap-1.5 type-sm text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft className="size-[15px]" aria-hidden />
        All designs
      </Link>

      {read.status === 'ok' ? (
        <>
          <PageTitle sub="Type on the left. What you see on the right is the picture that exports.">
            {read.design.title}
          </PageTitle>
          {paletteNote === null ? null : (
            <p className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
              {paletteNote}
            </p>
          )}
          <DesignEditor design={read.design} palette={resolved.palette} photos={photos} />
        </>
      ) : (
        <>
          <PageTitle>Design</PageTitle>
          <p role="alert" className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
            {read.status === 'no-workspace'
              ? 'Designs belong to a workspace, and this account is not in one.'
              : 'This design is saved and could not be opened just now. Nothing was lost. Reload the page, and if it keeps happening the problem is at our end rather than yours.'}
          </p>
        </>
      )}
    </div>
  )
}
