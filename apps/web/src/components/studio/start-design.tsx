'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { STUDIO_TEMPLATES, presetById } from '@sahoda/shared'

import { createDesign } from '@/app/actions/studio'
import { Button } from '@/components/ui/button'

/**
 * Pick a layout and start.
 *
 * ── THE SHAPE IS THE INFORMATION ────────────────────────────────────────────
 * Each card is drawn at its template's real proportions, because "one idea,
 * three placements" is legible from the shapes alone and unreadable as a list of
 * names. The roadmap version of this screen already made that argument and it
 * survives the screen becoming real.
 *
 * ── EVERY STATE SHIPS ───────────────────────────────────────────────────────
 * Pressing a card disables all of them, because a second press while the first
 * is in flight makes two designs and the person meant one. A failure says what
 * happened and leaves the cards usable, rather than a card stuck mid-press.
 */
export function StartDesign() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function start(templateId: string) {
    setError(null)
    setBusyId(templateId)
    startTransition(async () => {
      const result = await createDesign(templateId)
      if (result.ok) {
        router.push(`/studio/${result.design.id}`)
        return
      }
      setBusyId(null)
      setError(result.message)
    })
  }

  return (
    <section aria-labelledby="studio-start" className="flex flex-col gap-3">
      <div>
        <h2 id="studio-start" className="type-h2">
          Start a design
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Pick a layout. Your colours and type come from your Brand Brain, so it looks like your
          business before you have typed anything.
        </p>
      </div>

      <div className="grid gap-3 wide:grid-cols-3 max-wide:grid-cols-1">
        {STUDIO_TEMPLATES.map((template) => {
          const preset = presetById(template.presetId)
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => start(template.id)}
              disabled={pending}
              data-guide={`studio-template-${template.id}`}
              className="surface-ring group flex flex-col gap-2 rounded-card bg-surface p-3 text-left transition-micro hover:bg-s2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-45"
            >
              <div
                className="surface-ring w-full rounded-sm bg-s2"
                style={
                  preset === null
                    ? undefined
                    : { aspectRatio: `${preset.width} / ${preset.height}` }
                }
              />
              <span className="type-body font-[550]">{template.label}</span>
              <span className="type-sm text-muted">
                {busyId === template.id ? 'Opening…' : `${template.slots.length} things to fill in`}
              </span>
            </button>
          )
        })}
      </div>

      {error === null ? null : (
        <p role="alert" className="surface-ring rounded-card bg-s2 px-3 py-2 type-sm text-muted">
          {error}
        </p>
      )}
    </section>
  )
}
