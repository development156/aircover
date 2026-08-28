'use client'

import { useState, useTransition } from 'react'
import { BookmarkPlus, FolderOpen } from 'lucide-react'
import type { Channel } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/posts/inline-error'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { saveTemplate } from '@/app/actions/templates'
import type { TemplateRow, TemplatesRead } from '@/lib/templates/read'

/**
 * Saved starting points — save this post as one, or browse for one.
 *
 * ── TWO CONTROLS AT REST, AND NOTHING ELSE ──────────────────────────────────
 * Founder's ruling (REQUESTS §36): "it should not show any thing except save it
 * as a template and browse template — and in browse template they can choose
 * the template".
 *
 * The card used to print the whole library inline: a count, then every template
 * name, then the save link. On a composer sidebar that is a list nobody asked
 * to see, sitting above the editor, growing with every template saved. Browsing
 * is now a thing you ASK for.
 *
 * ── A COUNT IS A CLAIM, AND ONLY ONE OF THREE READS EARNS IT ────────────────
 * That reasoning survives the restructure and moves INSIDE the browser, where a
 * number is an answer to a question somebody just asked. A failed read shows no
 * number at all — not a zero, which would say "you have none" about a question
 * nobody managed to ask.
 *
 * ── AND BROWSE IS REFUSED, NEVER ABSENT ─────────────────────────────────────
 * With nothing saved, or with the read broken, the button is disabled and says
 * why — the §33 pattern. Hiding it would leave a card with one control and no
 * account of where the other one went.
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
  const [browsing, setBrowsing] = useState(false)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const templates = read.status === 'ok' ? read.templates : []
  const canBrowse = read.status === 'ok' && templates.length > 0

  /**
   * Why browsing is not on offer, in the words of the thing that actually
   * failed. Three different nothings, and they are not the same sentence: a
   * broken read is not an empty library, and neither is a missing workspace.
   */
  const whyNot =
    read.status === 'unreadable'
      ? 'Sahoda could not read your templates just now. Reload to try again.'
      : read.status === 'no-workspace'
        ? 'Templates belong to a workspace, and this account does not have one yet.'
        : templates.length === 0
          ? 'Nothing saved yet. Save a post you liked and start the next one from it.'
          : null

  const needle = query.trim().toLowerCase()
  const shown =
    needle === '' ? templates : templates.filter((t) => t.name.toLowerCase().includes(needle))

  return (
    <div className="surface-ring rounded-card bg-surface px-3 py-3" data-guide="create.templates">
      <span className="block type-sm font-semibold">Use a template</span>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          data-template-browse
          disabled={!canBrowse}
          aria-expanded={browsing}
          onClick={() => {
            setBrowsing((open) => !open)
            setQuery('')
          }}
        >
          <FolderOpen size={13} aria-hidden />
          {browsing ? 'Close' : 'Browse templates'}
        </Button>

        {/* ── SAVING, offered only when there is something to save ────────────
            A "Save as template" button on an empty box would create a template
            of nothing and call it a starting point. */}
        {body.trim() !== '' ? (
          <Button
            size="sm"
            variant="secondary"
            data-template-save
            onClick={() => {
              setNaming(true)
              setSaved(null)
              setBrowsing(false)
            }}
          >
            <BookmarkPlus size={13} aria-hidden />
            Save this post as a template
          </Button>
        ) : null}
      </div>

      {/* The reason, and ONLY when the button it explains is refused. Printing
          it beside a working Browse would be an apology for nothing. */}
      {!canBrowse && whyNot !== null ? (
        <p className="mt-1.5 type-meta text-muted">{whyNot}</p>
      ) : null}

      {/* ── THE BROWSER ────────────────────────────────────────────────────── */}
      {browsing && canBrowse ? (
        <div className="mt-2 space-y-1.5" data-template-browser>
          {/* THE COUNT, and only on the read that earned it — now beside the
              list it describes rather than on a card nobody opened. */}
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="template-search" className="type-meta text-muted">
              Pick one to start from
            </label>
            <span className="type-meta text-muted tabular-nums">{templates.length} saved</span>
          </div>
          <input
            id="template-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
            className="w-full rounded-input border border-line bg-bg px-2.5 py-1.5 type-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {shown.length === 0 ? (
            // The claim is exact: nothing MATCHED, which is a different sentence
            // from "you have none". The library is not empty; this search is.
            <p className="type-meta text-muted">No template matches “{query.trim()}”.</p>
          ) : (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {shown.map((template) => (
                <li key={template.id} className="flex items-baseline gap-2">
                  <button
                    type="button"
                    data-template-use={template.id}
                    onClick={() => {
                      onUse(template)
                      setBrowsing(false)
                    }}
                    className="min-w-0 flex-1 truncate text-left type-sm font-[550] transition-micro hover:text-accent"
                  >
                    {template.name}
                  </button>
                  {template.channel !== null ? (
                    <span className="shrink-0 type-meta text-muted">
                      {CHANNEL_LABELS[template.channel]}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {naming ? (
        <div className="mt-2 space-y-1.5">
          <input
            aria-label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Friday offer"
            className="w-full rounded-input border border-line bg-bg px-2.5 py-1.5 type-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      ) : null}

      {saved !== null ? (
        // Named, so the writer can tell which one landed when they have several.
        <p className="mt-1.5 type-meta text-muted">Saved as “{saved}”. Reload to see it listed.</p>
      ) : null}
      {error !== null ? (
        <div className="mt-1.5">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </div>
  )
}
