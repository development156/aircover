'use client'

import { useState, useTransition } from 'react'
import type { Channel } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/posts/inline-error'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { saveTemplate } from '@/app/actions/templates'
import type { TemplateRow, TemplatesRead } from '@/lib/templates/read'

/**
 * Saved starting points — save this post as one, or start from one.
 *
 * ── A COUNT IS A CLAIM, AND ONLY ONE OF THREE READS EARNS IT ────────────────
 * The reference card says "14 templates matched to your industry". That number is
 * a statement about the customer's library, so it appears only when the library
 * was actually read. A failed read shows no number at all — not a zero, which
 * would say "you have none" about a question nobody managed to ask, and not the
 * word "none" either.
 *
 * An empty library gets an empty STATE rather than `0 templates`: zero is a
 * measurement, and a customer who has never saved one has not measured anything.
 */
export interface TemplateCardProps {
  read: TemplatesRead
  /** The body to save, and the channel it was written for. */
  body: string
  channel: Channel | null
  /** Load a template's words into the editor. Writes nothing on its own. */
  onUse: (template: TemplateRow) => void
}

export function TemplateCard({ read, body, channel, onUse }: TemplateCardProps) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const templates = read.status === 'ok' ? read.templates : []

  return (
    <div className="surface-ring rounded-card bg-surface px-3 py-3" data-guide="create.templates">
      <div className="flex items-baseline justify-between gap-2">
        <span className="block text-[13px] font-semibold">Use a template</span>
        {/* THE COUNT, and only on the read that earned it. */}
        {read.status === 'ok' && templates.length > 0 ? (
          <span className="text-[11.5px] text-muted tabular-nums">{templates.length} saved</span>
        ) : null}
      </div>

      {read.status === 'unreadable' ? (
        // NOT "you have none" — that is a claim about the library, and this read
        // did not establish it. What failed was the reading.
        <p className="mt-1 text-[11.5px] text-muted">
          Sahoda could not read your templates just now. Reload to try again.
        </p>
      ) : read.status === 'no-workspace' ? (
        <p className="mt-1 text-[11.5px] text-muted">
          Templates belong to a workspace, and this account does not have one yet.
        </p>
      ) : templates.length === 0 ? (
        <p className="mt-1 text-[11.5px] text-muted">
          Nothing saved yet. Save a post you liked and start the next one from it.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {templates.map((template) => (
            <li key={template.id} className="flex items-baseline gap-2">
              <button
                type="button"
                data-template-use={template.id}
                onClick={() => onUse(template)}
                className="min-w-0 flex-1 truncate text-left text-[12.5px] font-[550] transition-micro hover:text-accent"
              >
                {template.name}
              </button>
              {template.channel !== null ? (
                <span className="shrink-0 text-[11px] text-muted">
                  {CHANNEL_LABELS[template.channel]}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* ── SAVING, offered only when there is something to save ──────────────
          A "Save as template" button on an empty box would create a template of
          nothing and call it a starting point. */}
      {body.trim() !== '' ? (
        naming ? (
          <div className="mt-2 space-y-1.5">
            <input
              aria-label="Template name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Friday offer"
              className="w-full rounded-input border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={pending}
                disabled={name.trim() === ''}
                onClick={() =>
                  startTransition(async () => {
                    const result = await saveTemplate(name, body, channel)
                    if (result.ok) {
                      setSaved(name.trim())
                      setNaming(false)
                      setName('')
                      setError(null)
                    } else {
                      setError(result.message)
                    }
                  })
                }
              >
                Save template
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setNaming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-template-save
            onClick={() => {
              setNaming(true)
              setSaved(null)
            }}
            className="mt-2 text-[12px] font-semibold text-accent underline underline-offset-2 transition-micro hover:opacity-80"
          >
            Save this post as a template
          </button>
        )
      ) : null}

      {saved !== null ? (
        // Named, so the writer can tell which one landed when they have several.
        <p className="mt-1.5 text-[11.5px] text-muted">
          Saved as “{saved}”. Reload to see it listed.
        </p>
      ) : null}
      {error !== null ? (
        <div className="mt-1.5">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </div>
  )
}
