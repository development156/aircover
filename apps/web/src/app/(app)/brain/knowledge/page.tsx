import Link from 'next/link'
import { Library } from 'lucide-react'

import { AddDocument } from '@/components/knowledge/add-document'
import { DocumentRow } from '@/components/knowledge/document-row'
import { LibrarySearch } from '@/components/knowledge/library-search'
import { ResolveFromLibrary } from '@/components/knowledge/resolve-from-library'
import { WhatToGive } from '@/components/knowledge/what-to-give'
import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { countPendingLibrarySuggestions, readLibrary, searchLibrary } from '@/lib/knowledge/store'
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
          body="A library belongs to a workspace and you don't have one yet. Nothing failed. There is simply nowhere to put a document."
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
          body="This is not a claim that it is empty. The list did not come back. Reload the page."
        />
      </Shell>
    )
  }

  if (library.status === 'empty') {
    return (
      <Shell action>
        <EmptyState
          icon={Library}
          title="Stop Sahoda guessing your prices"
          body="Give it your rate card, your returns policy, or the answer to the question customers keep asking. It keeps your exact words and remembers which document each one came from."
          action={<AddDocument />}
          /* THE SENTENCE THIS ONCE HELD IS TRUE AGAIN, and the history is worth
             keeping. It used to read "A post that names a price should be
             naming one you gave me, not one I guessed", and was replaced
             because nothing in `packages/mesh` referenced knowledge and no
             writing path read a passage. It described behaviour that did not
             exist.

             It exists as of 2026-08-29: `packages/mesh/src/knowledge-context.ts`
             is live in production, `caption_rewrite` and `content_variants`
             declare `knowledgeQuery`, and the block forbids stating a number
             the passages do not contain. So the claim returns, in the third
             person this time, and NARROWED to the two tasks that actually read:
             rewriting a post and offering other versions of it. The weekly plan
             and the site builder still do not, and a tip that implied they did
             would be the same defect in the other direction. */
          tip="Once something is here, Sahoda quotes your figures when it rewrites a post, rather than inventing one."
        />
      </Shell>
    )
  }

  const indexed = library.documents.filter((d) => d.status === 'indexed').length

  /**
   * TOGETHER, not one after the other. `read-waterfall.test.ts` caught this as a
   * ninth sequential read the first time it was written, which is the guard
   * working: neither of these needs the other's answer, and a page that awaits
   * them in turn is slower by a whole round trip for no reason.
   *
   * Searched only when asked. A page load with no query runs no search rather
   * than running an empty one and rendering "nothing matched ''".
   *
   * `waiting` is what an earlier read already produced and nobody has answered.
   * Read on the server so a press costs no round trip, and `null` when the count
   * did not answer, which the confirm panel treats as a re-run rather than as
   * permission to spend.
   */
  const [search, waiting] = await Promise.all([
    query ? searchLibrary(query) : Promise.resolve(null),
    indexed > 0 ? countPendingLibrarySuggestions() : Promise.resolve(0),
  ])

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
        <ResolveFromLibrary
          cost={creditCost(MESH_TASK_ACTION['brand_extract'])}
          waiting={waiting}
        />
      ) : null}

      {/* GUIDANCE WHILE IT IS STILL SPARSE, and gone once it is not. Under four
          documents a person is still working out what belongs here; past that
          they have their own answer and a standing block of advice becomes
          furniture. Four rather than one, because a library with a single
          website in it, which is what every seeded workspace now starts with,
          is exactly the case that still needs the prompt. */}
      {library.documents.length < 4 ? <WhatToGive /> : null}

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
            <span className="num">{library.documents.length}</span> Sahoda can quote from
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
          {/* CAPABILITY, NOT MECHANISM. This paragraph used to name the parts:
              documents, passages, searching, resolving. A shop owner does not
              want passages, and "resolve your Brand Brain" is a sentence only
              somebody who built it can parse. What they want is for Sahoda to
              stop guessing their price, which is now literally what happens.
              Every clause here is a thing the product does today: the quoting
              is live as of 2026-08-29, and adding is free because no model is
              called on the way in. */}
          <p className="mt-1 max-w-[62ch] type-body text-muted">
            Give Sahoda the documents that hold your real prices, policies and promises. It reads
            them once and quotes them back when it writes for you, instead of guessing. Adding a
            document is free.
          </p>
        </div>
        {action ? (
          <div className="max-narrow:w-full">
            <AddDocument />
          </div>
        ) : null}
      </div>

      {children}

      {/* WHAT IS ENFORCED, AND ONLY THAT. This said "and never trains on it".
          MEASURED 2026-08-29: nothing in `packages/mesh` carries a no-training
          term, header or routing preference; grepped for `data_collection`,
          `allow_training`, `zdr` and `retention`. It is a supplier contract
          wearing a product guarantee's clothes, and this product does not make
          claims its own code cannot keep. The separation between workspaces IS
          enforced, in the database, and is stated. The second sentence replaces
          the promise with the fact it was standing on: what leaves, and when. */}
      <p className="type-sm text-muted">
        Nothing in your library is ever shared with another business. A few passages go to the model
        that writes your words, at the moment it writes them, and only the ones that match. What
        Sahoda already knows about your voice and promise is on{' '}
        <Link href="/brain" className="font-[550] text-accent underline underline-offset-2">
          the overview
        </Link>
        .
      </p>
    </div>
  )
}
