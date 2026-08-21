import Link from 'next/link'
import { FileText, Sparkles } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { BatchPreview } from '@/components/remix/batch-preview'
import { PlanBatch } from '@/components/remix/plan-batch'
import { Button } from '@/components/ui/button'
import { MISSING_KINDS } from '@/lib/remix/catalogue'
import { readCurrentBatch } from '@/lib/remix/read'
import { listPosts } from '@/lib/posts/read'
import { activeWorkspaceRead } from '@/lib/workspaces'

export const metadata = { title: 'Remix' }

/**
 * REMIX — one thing you already made, turned into everything else.
 *
 * ── THIS SCREEN USED TO BE A DRAWING, AND WHAT CHANGED ───────────────────────
 * It offered six outputs: posts, a carousel outline, a reel script, an email, a
 * blog outline and a WhatsApp broadcast. Four of the six cannot be produced by
 * this codebase — three need a mesh task that does not exist, and two name a
 * channel Sahoda does not publish to. So the six cards became four things that
 * really run and six things that really do not, each naming the ONE thing it
 * needs. Nothing was dropped; the promises that are still outstanding are still
 * on the page, as sentences rather than as buttons.
 *
 * ── AND IT LEFT roadmap-honesty.spec.ts ─────────────────────────────────────
 * That suite requires every number on a roadmap section to be a credit price or
 * an ordinal, and requires the words "coming soon". Both were true of the
 * drawing and neither is true now: this screen prices a real batch, counts real
 * drafts, and charges real credits. It leaves that list for the same reason
 * `/loop` and `/report` left it, and it is replaced by a narrower guard rather
 * than a wider allowance — `components/remix/batch-preview.test.tsx` walks the
 * rendered panel and fails on any digit that is not a price, a sum of prices, or
 * a count of rows.
 */

/** How many posts the source picker offers. Stated so the screen can say it. */
const SOURCE_LIMIT = 30

export default async function RemixPage() {
  const workspace = await activeWorkspaceRead()

  if (workspace.status !== 'ok') {
    return (
      <div className="space-y-grid">
        <PageTitle sub="Turn one thing you already wrote into a week of posts.">Remix</PageTitle>
        <EmptyState
          icon={Sparkles}
          title={workspace.status === 'none' ? 'No workspace yet' : 'Could not read your workspace'}
          body={
            workspace.status === 'none'
              ? 'Remix works on the posts in a workspace, so there has to be one first.'
              : 'Sahoda asked and got nothing back. Reloading is worth a try.'
          }
        />
        <Missing />
      </div>
    )
  }

  const [posts, batch] = await Promise.all([
    listPosts(),
    readCurrentBatch(workspace.workspace.id),
  ])
  const sources = posts.filter((post) => (post.body ?? '').trim() !== '').slice(0, SOURCE_LIMIT)

  return (
    <div className="space-y-grid">
      <PageTitle sub="Turn one thing you already wrote into a week of posts.">Remix</PageTitle>

      {batch && batch.status !== 'done' && batch.status !== 'failed' ? (
        <BatchPreview batch={batch} />
      ) : sources.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Write something first"
          body="Remix works on a post you already have. Write one long enough to be worth splitting up, and it will show up here."
          action={
            <Button asChild>
              <Link href="/create/post">Write a post</Link>
            </Button>
          }
        />
      ) : (
        <PlanBatch posts={sources} />
      )}

      {batch && (batch.status === 'done' || batch.status === 'failed') ? (
        <BatchPreview batch={batch} />
      ) : null}

      <Missing />
    </div>
  )
}

/**
 * What Remix still cannot make, and the one thing each one needs.
 *
 * Rendered as a list of sentences and NOT as cards with buttons: a card with a
 * greyed control is still announced as a control, and a screen reader offering
 * an action that does nothing reads as a broken app rather than an unbuilt one.
 */
function Missing() {
  return (
    <section aria-labelledby="remix-missing" className="surface-ring rounded-card bg-surface p-4">
      <h2 id="remix-missing" className="type-h3">
        What Remix cannot make yet
      </h2>
      <p className="type-body mt-1 max-w-[68ch] text-muted">
        Each of these needs one specific thing, named. None of them is a button that would do
        nothing.
      </p>
      <dl className="mt-3 grid gap-2.5">
        {MISSING_KINDS.map((missing) => (
          <div key={missing.label}>
            <dt className="type-body font-[550] text-ink">{missing.label}</dt>
            <dd className="type-sm max-w-[68ch] text-muted">Needs {missing.needs}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
