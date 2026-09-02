'use client'

import type { Route } from 'next'
import { useRouter, useSearchParams } from 'next/navigation'
import { useId, useState } from 'react'
import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { KnowledgePassage } from '@/lib/knowledge/store'

/**
 * Searching the library, and showing the passage rather than the file.
 *
 * ── WHY THE RESULT IS A PASSAGE ─────────────────────────────────────────────
 * "Show me the menu" is not a question anybody has. "What does a masala dosa
 * cost" is. A result list of filenames answers the first; this answers the
 * second, and names the document underneath so the answer can be checked.
 *
 * ── A FORM, IN THE URL, ON PURPOSE ──────────────────────────────────────────
 * The query lives in the query string, so the search runs on the server under
 * the caller's own RLS, a result is linkable, and Back works. A client-side
 * filter over a fetched list would search only what was already downloaded —
 * which for a library of two thousand passages is a search that quietly covers
 * the first page.
 */
export function LibrarySearch({
  results,
  query,
  unreadable,
}: {
  results: KnowledgePassage[]
  query: string
  /** The read did not answer. NOT the same as finding nothing. */
  unreadable: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(query)
  const inputId = useId()

  const run = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = new URLSearchParams(params.toString())
    if (value.trim()) next.set('q', value.trim())
    else next.delete('q')
    // `as Route`: typedRoutes cannot prove a template literal is a real
    // route, and this one is — the page it is on.
    router.push(`/brain/knowledge${next.toString() ? `?${next}` : ''}` as Route)
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="knowledge-search">
      <h2 id="knowledge-search" className="sr-only">
        Search your library
      </h2>

      <form onSubmit={run} className="flex flex-col gap-2 narrow:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            strokeWidth={1.8}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          />
          <input
            id={inputId}
            name="q"
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Find a price, an hour, a policy"
            aria-label="Find a price, an hour, a policy"
            className="h-11 w-full rounded-input bg-surface pr-3 pl-9 type-body text-ink surface-ring-firm placeholder:text-muted focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--brand)]"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {query ? (
        unreadable ? (
          <p role="alert" className="type-body text-danger">
            Sahoda could not run that search just now. This is not a claim that your library has
            nothing matching. The search did not come back. Try again.
          </p>
        ) : results.length === 0 ? (
          <p className="type-body text-muted">
            Nothing in your library mentions <span className="font-[550] text-ink">“{query}”</span>.
            Sahoda searched the words in every document it has read. A document still being read is
            not in there yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((passage) => (
              <li key={passage.id} className="surface-ring rounded-card bg-surface p-3">
                <p className="type-body whitespace-pre-wrap text-ink">{passage.text}</p>
                {/* THE SOURCE, on every result. A passage without one is a claim
                    about the business that nobody can check. */}
                <p className="mt-2 type-sm text-muted">
                  {passage.document_title} · passage{' '}
                  <span className="num">{passage.ordinal + 1}</span>
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}
