'use client'

import { useState } from 'react'

import { InlineRewrite } from '@/components/posts/inline-rewrite'
import { Textarea } from '@/components/ui/textarea'
import { NotBuiltYet } from '@/components/composer/not-built-yet'
import { selectedText, spliceSelection, type SelectionRange } from '@/lib/posts/splice-selection'

export interface WritingPaneProps {
  body: string
  onBodyChange: (body: string) => void
}

/**
 * The post itself — written once, before any channel has an opinion about it.
 *
 * ── WHY THE SOURCE IS ITS OWN THING AND NOT "THE FIRST CHANNEL" ──────────────
 * Because it is what the writer means, and the channel versions are what each
 * platform will accept. Collapsing the two — writing straight into Instagram and
 * copying outward — is what every competitor does, and it makes the first channel
 * silently authoritative. Here, the post has no limit, no format and no publish
 * state; only its versions do.
 *
 * ── WHY THIS IS SEPARATE FROM THE TEMPLATE AND MEDIA BLOCK ───────────────────
 * So the per-channel versions can sit BETWEEN them when the layout is one column.
 * MEASURED at 768px with both in one pane: the versions — the only thing on this
 * screen that no competitor has — were the last thing on the page, below an empty
 * media well. Order is the argument, and at every width it now reads: write it,
 * see each version, then attach and reuse.
 *
 * ── WHAT AI CAN AND CANNOT DO HERE, STATED HONESTLY ──────────────────────────
 * Selection rewriting is real and priced (`caption_rewrite`, three instructions).
 * Drafting a post from nothing, changing its tone and expanding it are NOT built:
 * `CaptionRewriteInputSchema` is a frozen contract in `@sahoda/shared` and takes
 * `rewrite | shorten | hookify`, and no mesh task writes a body from a brief. So
 * they are named as absent in one line rather than rendered as buttons that would
 * fail, and rather than left out entirely, which would read as never planned.
 */
export function WritingPane({ body, onBodyChange }: WritingPaneProps) {
  const [selection, setSelection] = useState<SelectionRange | null>(null)

  function captureSelection(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const element = event.currentTarget
    setSelection(
      element.selectionStart === element.selectionEnd
        ? null
        : { start: element.selectionStart, end: element.selectionEnd },
    )
  }

  return (
    <div className="space-y-3" data-guide="post-body">
      <div className="space-y-1.5">
        <label htmlFor="post-body" className="type-eyebrow block text-muted">
          Your post
        </label>
        <Textarea
          id="post-body"
          rows={10}
          /**
           * Shorter on a phone, and the number is measured rather than guessed.
           *
           * MEASURED at 360x800 with `rows={10}`: the writing box ran to y=570 and
           * the first version card's body was below the fold, so the screen that
           * exists to show you each version showed you none of them until you
           * scrolled. `resize-y` is still on, so anyone who wants the taller box
           * drags it — the default is what a phone opens to, not a ceiling.
           */
          className="max-narrow:h-[150px]"
          value={body}
          placeholder="Write it the way you would say it. Sahoda adapts it per channel."
          onChange={(event) => onBodyChange(event.target.value)}
          onSelect={captureSelection}
        />
        <p className="text-[12px] text-muted">Select any part to rewrite just that piece.</p>
      </div>

      {/* The splice runs against the CURRENT body, not the one captured when the
          rewrite was requested: the box stays editable while the model works, and
          splicing a stale string back would silently drop whatever was typed in
          the meantime. If the selected text moved, the rewrite is refused rather
          than applied blind, and the panel shows the paid result so it is not
          thrown away. */}
      {/* ── THE THREE AI THINGS THIS SCREEN DOES NOT DO ─────────────────────
          Named where they would be, rather than left out. Leaving them out
          reads as never planned; a disabled button would be a control that
          exists and refuses. `CaptionRewriteInputSchema` in @sahoda/shared
          takes `rewrite | shorten | hookify` and nothing else, and no mesh
          task writes a body from a brief — both are frozen contracts. */}
      <NotBuiltYet>
        Sahoda can rewrite, shorten or hook up a piece you select. Writing a first draft from a
        brief, changing the tone and expanding a line are not built — each needs a new kind of AI
        task, and the list of tasks it can run is fixed for now.
      </NotBuiltYet>

      <InlineRewrite
        body={body}
        selection={selection}
        onReplace={(range, replacement, expected) => {
          if (selectedText(body, range) !== expected) return false
          onBodyChange(spliceSelection(body, range, replacement))
          setSelection(null)
          return true
        }}
      />
    </div>
  )
}
