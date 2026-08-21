import Link from 'next/link'
import { Library } from 'lucide-react'

import { AddDocument } from '@/components/knowledge/add-document'
import { DocumentRow } from '@/components/knowledge/document-row'
import { LibrarySearch } from '@/components/knowledge/library-search'
import { ResolveFromLibrary } from '@/components/knowledge/resolve-from-library'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { readLibrary, searchLibrary } from '@/lib/knowledge/store'
import { creditCost, MESH_TASK_ACTION } from '@sahoda/shared'

export const metadata = { title: 'Knowledge' }

/**
 * THE KNOWLEDGE LIBRARY — what the Brand Brain keeps learning from.
 *
 * ── WHAT THIS SCREEN USED TO BE ─────────────────────────────────────────────
 * A designed coming-soon page, and an honest one: it rendered a search box with
 * nothing behind it as inert, and said outright that "no table in the database
 * holds a document, a fact or a citation, so the search box above would have
 * nothing to search." That was true. It is not any more.
 *
 * ── WHY THIS IS THE FEATURE THAT IMPROVES A SHIPPED ONE ─────────────────────
 * The Brand Brain reads a website or a PDF ONCE, at onboarding, and never again.
 * Everything a business hands over afterwards had nowhere to go. A library makes
 * the reading continuous: the brain keeps learning from what the business
 * actually gives it, and every inference it draws can name the passage it came
 * from.
 *
 * ── FOUR READS, FOUR SENTENCES ──────────────────────────────────────────────
 * No workspace, an empty library, a library, and a read that failed are four
 * different facts. Collapsing them is how a library holding forty documents
 * tells its owner it is empty. `lib/knowledge/store.ts` keeps them apart and
 * this page says something different for each.
 *
 * ── NOTHING HERE COSTS CREDITS ──────────────────────────────────────────────
 * Said on the page, once, because a person who has learned that everything in
 * this product has a price will assume this does. Parsing is local, chunking is
 * arithmetic, and search is Postgres' own index. `pricing.config.json` has no
 * knowledge action and must not gain one.
 */
export default async function BrainKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const query = (params.q ?? '').trim()
  const library = await readLibrary()

  if (library.status === 'no-workspace') {
    return (
      <Shell>
        <EmptyState
          icon={Library}
          title="Create a workspace to build a library"
          body="A library belongs to a workspace and you don't have one yet. Nothing failed — there is simply nowhere to put a document."
          action={<CreateWorkspaceButton variant="primary" />}
        />
      </Shell>
    )
  }

  if (library.status === 'unreadable') {
    return (
      <Shell>
        <EmptyState
          icon={Library}
          title="Sahoda could not read your library"
          body="This is not a claim that it is empty — the list did not come back. Reload the page."
        />
      </Shell>
    )
  }

  if (library.status === 'empty') {
    return (
      <Shell action>
        <EmptyState
          icon={Library}
          title="Give Sahoda something to read"
          body="Your menu, your rate card, your returns policy, the answer to the question customers keep asking. Sahoda keeps the words and remembers which document each one came from."
          action={<AddDocument />}
          tip="A post that names a price should be naming one you gave me, not one I guessed."
        />
      </Shell>
    )
  }

  // Searched only when asked. A page load with no query runs no search rather
  // than running an empty one and rendering "nothing matched ''".
  const search = query ? await searchLibrary(query) : null
  const indexed = library.documents.filter((d) => d.status === 'indexed').length

  return (
    <Shell action>
      <LibrarySearch
        query={query}
        results={search?.status === 'ok' ? search.passages : []}
        unreadable={search !== null && search.status !== 'ok'}
      />

      {/* Only once there is something to read. An offer to read an empty
          library is a button that can only disappoint, and the empty state
          already asks for the one thing that fixes it. */}
      {indexed > 0 ? (
        <ResolveFromLibrary cost={creditCost(MESH_TASK_ACTION['brand_extract'])} />
      ) : null}

      <section aria-labelledby="knowledge-documents" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="knowledge-documents" className="type-h2">
            Everything you have given Sahoda
          </h2>
          {/* A COUNT OF ROWS THAT EXIST, from the same read that drew the list —
              never a figure from the reference design. `indexed` and not
              `documents.length`, because a document Sahoda could not read is in
              the table and is not in the library in any sense the reader means. */}
          <p className="type-sm text-muted">
            <span className="num">{indexed}</span> of{' '}
            <span className="num">{library.documents.length}</span> ready to quote from
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {library.documents.map((document) => (
            <DocumentRow key={document.id} document={document} />
          ))}
        </ul>
      </section>
    </Shell>
  )
}

/**
 * The page frame.
 *
 * `AddDocument` renders here, once, in every state that has a workspace —
 * INCLUDING the empty one, where it also appears inside the empty state. That
 * duplication is deliberate and `assets/page.tsx` records why: a control that
 * reports an outcome has to outlive the state change it causes, or the first
 * upload's confirmation unmounts along with the empty state it replaced.
 */
function Shell({ children, action = false }: { children: React.ReactNode; action?: boolean }) {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-h1">Knowledge</h1>
          <p className="mt-1 max-w-[62ch] type-body text-muted">
            The documents Sahoda has read about your business, and the passages it can quote. A post
            that names a price uses one from here, or it does not name one. Adding a document is
            free.
          </p>
        </div>
        {action ? (
          <div className="max-narrow:w-full">
            <AddDocument />
          </div>
        ) : null}
      </div>

      {children}

      <p className="type-sm text-muted">
        Sahoda never shares anything in your library between workspaces, and never trains on it.
        What it already knows about your voice and promise is on{' '}
        <Link href="/brain" className="font-[550] text-accent underline underline-offset-2">
          the overview
        </Link>
        .
      </p>
    </div>
  )
}
