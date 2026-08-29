'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { startFromTemplate } from '@/app/actions/studio'
import { describeStartedFrom } from '@/lib/studio/template-copy'

/**
 * The one interactive part of a starting-point card, and NOTHING else.
 *
 * ── WHY THIS IS SPLIT OFF, MEASURED ─────────────────────────────────────────
 * The shelf was first written as a single client component. `next build` then
 * reported `/studio 683.6 kB > 594.5 kB budget (+89.1 kB)`: marking the shelf
 * `'use client'` dragged `composeScene` and `renderSvg` out of the server and
 * into the landing page's bundle, because the previews render through them.
 *
 * The gallery beside it never had that cost, and this is why: it renders the
 * previews on the SERVER. So the preview stays a server child, passed in
 * through `children`, and only the press crosses into the browser.
 *
 * That is not a micro-optimisation. `/studio` is the first screen of the
 * feature, and 89 kB is a second of blank page on a mid-range Android over a
 * metered connection, spent on code that draws pictures the server already drew.
 */
export function StartFromTemplate({
  designId,
  title,
  children,
}: {
  designId: string
  title: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  function start() {
    setNote(null)
    startTransition(async () => {
      const result = await startFromTemplate(designId)
      if (result.ok) {
        // Rarely seen, because the new design opens. Set anyway so a navigation
        // that does not happen leaves a sentence rather than a button that
        // stopped responding.
        setNote(describeStartedFrom(title))
        router.push(`/studio/${result.design.id}`)
        return
      }
      setNote(result.message)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        data-guide="studio-starting-point"
        className="group flex flex-col gap-2 rounded-card text-left transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45"
      >
        {children}
        <span className="type-body font-[550] group-hover:underline group-hover:underline-offset-2">
          {title}
        </span>
        <span className="type-sm text-muted">
          {pending ? 'Opening…' : 'Start a design from this'}
        </span>
      </button>
      {note === null ? null : (
        <p role="status" className="type-sm text-muted">
          {note}
        </p>
      )}
    </div>
  )
}
