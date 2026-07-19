'use client'

import { useState } from 'react'
import type { Post, PostMedia, PostVariant } from '@sahoda/shared'

import { CardLabel } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { selectedText, spliceSelection, type SelectionRange } from '@/lib/posts/splice-selection'

import { BottomBar } from './bottom-bar'
import { InlineError } from './inline-error'
import { InlineRewrite } from './inline-rewrite'
import { MediaPane } from './media-pane'
import { useAutosave, type AutosaveStatus } from './use-autosave'
import { useVariants } from './use-variants'
import { VariantTabs } from './variant-tabs'

export interface PostEditorProps {
  post: Post
  variants: PostVariant[]
  media: PostMedia[]
}

const STATUS_COPY: Readonly<Record<AutosaveStatus, string>> = {
  idle: 'No changes yet',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Not saved',
}

/**
 * Three-pane post editor (docs/06 §4.3): media on the left, the canonical body
 * in the centre, per-channel variants on the right, and the whole-post controls
 * along the bottom.
 *
 * The canonical body autosaves on a 2s debounce; variants save explicitly,
 * because editing one unlinks it from the canonical body server-side and that
 * is not something to do behind the writer's back.
 */
export function PostEditor({ post, variants, media }: PostEditorProps): React.JSX.Element {
  const autosave = useAutosave(post.id, post)
  const variantsApi = useVariants(post.id, variants)
  const [selection, setSelection] = useState<SelectionRange | null>(null)

  const { draft } = autosave

  function captureSelection(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const element = event.currentTarget
    setSelection(
      element.selectionStart === element.selectionEnd
        ? null
        : { start: element.selectionStart, end: element.selectionEnd },
    )
  }

  return (
    <div className="space-y-grid" data-guide="post-editor">
      {/* The row moved somewhere other than this editor. We deliberately do NOT
          say who overwrote whom: every `updated_at` we see is a post-write one,
          so that ordering is unknowable here (see `use-autosave.ts`). Both
          buttons are real choices — one loads the other version, the other
          writes the local draft over it. */}
      {autosave.divergence !== null ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-input border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn"
        >
          <span className="grow">
            {autosave.divergence.message} Both versions are still here — choose which one to keep.
          </span>
          <button
            type="button"
            onClick={autosave.loadTheirs}
            className="rounded-pill border border-warn px-2.5 py-1 text-[12px] font-semibold transition-micro hover:bg-warn hover:text-white"
          >
            Load that version
          </button>
          <button
            type="button"
            onClick={autosave.keepMine}
            className="rounded-pill px-2.5 py-1 text-[12px] font-semibold underline underline-offset-2 transition-micro hover:opacity-80"
          >
            Keep mine and save
          </button>
        </div>
      ) : null}

      <div className="grid gap-grid wide:grid-cols-[minmax(0,230px)_minmax(0,1fr)_minmax(0,370px)]">
        <MediaPane media={media} channels={draft.channels} />

        <section className="space-y-3" data-guide="post-body">
          <div className="flex items-center justify-between gap-2">
            <CardLabel className="mb-0">Post</CardLabel>
            <span
              aria-live="polite"
              className={
                autosave.status === 'error' ? 'text-[12px] text-danger' : 'text-[12px] text-faint'
              }
            >
              {STATUS_COPY[autosave.status]}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="post-title">Title</Label>
            <Input
              id="post-title"
              value={draft.title}
              placeholder="Name this post so you can find it later"
              onChange={(event) => autosave.update({ title: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="post-body">Body</Label>
            <Textarea
              id="post-body"
              rows={14}
              value={draft.body}
              placeholder="Write the post once — I'll shape it per channel."
              onChange={(event) => autosave.update({ body: event.target.value })}
              onSelect={captureSelection}
            />
            <p className="text-[12px] text-faint">
              Select any part of the body to rewrite just that piece.
            </p>
          </div>

          {/* The splice runs against the CURRENT body, not the one captured when
              the rewrite was requested: the textarea stays editable while the
              model works, and splicing a stale string back would silently drop
              whatever was typed in the meantime. If the selected text moved
              under us the rewrite is refused rather than applied blind — the
              panel then shows the paid result so it is not thrown away. */}
          <InlineRewrite
            body={draft.body}
            selection={selection}
            onReplace={(range, replacement, expected) => {
              const current = autosave.read()
              if (selectedText(current.body, range) !== expected) return false
              autosave.update({ body: spliceSelection(current.body, range, replacement) })
              setSelection(null)
              return true
            }}
          />

          {/* The retry button matters: a writer who has stopped typing has no
              other way back: the debounced save only re-fires on the next edit,
              so without this the last words written before a dropped connection
              would need a fake keystroke to reach the server. */}
          {autosave.error !== null ? (
            <InlineError className="flex flex-wrap items-center gap-3">
              <span className="grow">
                {autosave.error} Your text is still here — retry now, or keep editing and I&rsquo;ll
                retry on the next change.
              </span>
              <button
                type="button"
                onClick={() => void autosave.flush()}
                className="rounded-pill border border-danger px-2.5 py-1 text-[12px] font-semibold transition-micro hover:bg-danger hover:text-white"
              >
                Retry save
              </button>
            </InlineError>
          ) : null}
        </section>

        {/* The meters score the post's REAL attachment count, so a channel's
            `maxMediaCount` (GBP allows 1) can actually fire. `media` is the same
            list `MediaPane` renders, so the two panes cannot disagree. */}
        <VariantTabs
          channels={draft.channels}
          canonicalBody={draft.body}
          variants={variantsApi}
          mediaCount={media.length}
        />
      </div>

      <BottomBar
        postId={post.id}
        channels={draft.channels}
        scheduledAt={draft.scheduledAt}
        onChannelsChange={(channels) => autosave.update({ channels })}
        onScheduleChange={(scheduledAt) => autosave.update({ scheduledAt })}
        flush={autosave.flush}
        onGenerated={variantsApi.applyGenerated}
      />
    </div>
  )
}
