'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { removeCompetitor } from '@/app/actions/radar'
import { InlineError } from '@/components/posts/inline-error'
import { Button } from '@/components/ui/button'

/**
 * STOP WATCHING ONE BUSINESS.
 *
 * ── ITS OWN CLIENT ISLAND, FOR A REASON THE BUILD MEASURED ──────────────────
 * The card around it is static markup: an icon, a name, a date, a claim and two
 * links. Only this button needs JavaScript. Rendering the whole card in a
 * `'use client'` component to get one button shipped the markup, the three kind
 * icons and the claim copy to the browser as well, and put `/radar` 12.6 kB over
 * its byte budget. The card is a server component again and this is the island
 * inside it.
 *
 * ── THE RESULT IS READ ──────────────────────────────────────────────────────
 * Discarding it left a refused delete looking like a successful one: the row
 * stayed on screen, nothing was said, and the obvious next move for the reader
 * is to press it again.
 */
export function RemoveWatch({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function drop() {
    setError(null)
    startTransition(async () => {
      const result = await removeCompetitor(id)
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={drop} disabled={pending}>
        <Trash2 size={14} aria-hidden />
        <span className="sr-only">Stop watching {name}</span>
        <span aria-hidden>Remove</span>
      </Button>
      {error ? <InlineError>{error}</InlineError> : null}
    </>
  )
}
