'use client'

import { useState } from 'react'
import { EyeOff } from 'lucide-react'
import { CONSTRAINTS, type Channel } from '@sahoda/shared'
import { refuseFormat, type PostFormat } from '@sahoda/publishing/format'

import { Button } from '@/components/ui/button'
import { ChannelMark } from '@/components/posts/channel-mark'
import { ChannelMeterView } from '@/components/posts/channel-meter'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { InlineError } from '@/components/posts/inline-error'
import { InlineRewrite } from '@/components/posts/inline-rewrite'
import { LiveLink } from '@/components/posts/live-link'
import { Textarea } from '@/components/ui/textarea'
import { VariantConflictNotice } from '@/components/posts/variant-conflict-notice'
import { hasLink } from '@/lib/posts/detect-link'
import { meterFor, withFormat } from '@/lib/posts/counters'
import { selectedText, spliceSelection, type SelectionRange } from '@/lib/posts/splice-selection'
import type { VariantExtras } from '@/lib/posts/variant-extras'
import type { VariantState } from '@/components/posts/use-variants'

import { RelinkControl } from './relink-control'
import { trimToFit } from './trim-to-fit'
import { VersionOptions } from './version-options'
import { VersionState } from './version-state'

export interface VersionCardProps {
  channel: Channel
  state: VariantState
  /** Files on the POST — every channel is scored against the same count. */
  mediaCount: number
  format: PostFormat | null
  onFormatChange: (format: PostFormat | null) => void
  onBodyChange: (body: string) => void
  onExtrasChange: (patch: VariantExtras) => void
  onSave: () => void
  onKeepMine: () => void
  onUseTheirs: (theirs: string) => void
  /** The post's body right now — what "Follow the post again" would bring across. */
  canonicalBody: string
  onRelink: () => void
  onUndoRelink: () => void
}

/**
 * ONE CHANNEL'S VERSION OF THE POST. The unit the whole screen is built from.
 *
 * ── WHY THESE ARE STACKED CARDS AND NOT TABS ─────────────────────────────────
 * Tabs show one version and hide the rest. The one thing this product does that
 * its competitors do not is keep a SEPARATE body, a separate limit and a separate
 * publish state per channel — and a control that shows one at a time hides
 * exactly that. Four cards down the page means the writer SEES four different
 * posts being written, which is the product demonstrating itself.
 *
 * The cost is height, and it is paid deliberately: scrolling past your own four
 * versions is the correct amount of work for reading four versions.
 *
 * ── EVERY VERDICT ON THIS CARD IS THE ENGINE'S ───────────────────────────────
 * The limit, the count and every objection come from `meterFor`, which is the
 * frozen Constraint Engine in `@sahoda/shared`. Nothing here counts a character
 * or decides a rule, so the meter the writer watches and the rule the adapter
 * enforces cannot drift.
 */
export function VersionCard({
  channel,
  state,
  mediaCount,
  format,
  onFormatChange,
  onBodyChange,
  onExtrasChange,
  onSave,
  onKeepMine,
  onUseTheirs,
  canonicalBody,
  onRelink,
  onUndoRelink,
}: VersionCardProps) {
  const spec = CONSTRAINTS[channel]
  const label = CHANNEL_LABELS[channel]
  const [selection, setSelection] = useState<SelectionRange | null>(null)

  const hashtags = state.extras.hashtags
  // ── TWO VERDICTS, FROM TWO SOURCES, ON ONE CARD ─────────────────────────────
  // The engine says what this CHANNEL allows; the format says what the WRITER
  // meant. `runPublishPost` asks them in exactly this order and so does this
  // card, so what the writer sees here is what the publisher will decide — a
  // photo post with no photo is red before Publish rather than after.
  const meter = withFormat(
    meterFor(channel, {
      body: state.body,
      hashtags,
      hasLink: hasLink(state.body),
      mediaCount,
    }),
    refuseFormat(spec, format, mediaCount),
  )

  // MAX_MEDIA_COUNT deliberately gets no entry. Media lives on the post and this
  // card cannot detach a file, so a "Remove extra media" button would do nothing;
  // `ChannelMeterView` renders the label as plain text when no handler exists,
  // which states the problem without faking an affordance.
  const fixes: Partial<Record<string, () => void>> = {
    MAX_CHARS: () => onBodyChange(trimToFit(channel, state.body, hashtags)),
    // The one format problem this card can resolve in a click: the kind and the
    // attachments disagree, and the kind is the half that lives here. Clearing it
    // back to "Not stated" is honest — the writer said something that was not
    // true of the post, and none of their words or files are touched.
    FORMAT_CONTRADICTED: () => onFormatChange(null),
    FORMAT_UNSUPPORTED: () => onFormatChange(null),
  }
  if (spec.maxHashtags !== undefined && hashtags !== undefined) {
    const limit = spec.maxHashtags
    fixes['MAX_HASHTAGS'] = () => onExtrasChange({ hashtags: hashtags.slice(0, limit) })
  }

  function captureSelection(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const element = event.currentTarget
    setSelection(
      element.selectionStart === element.selectionEnd
        ? null
        : { start: element.selectionStart, end: element.selectionEnd },
    )
  }

  return (
    <section
      data-version-card={channel}
      aria-labelledby={`version-heading-${channel}`}
      className="surface-ring space-y-3 rounded-card bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`version-heading-${channel}`} className="type-h3 flex items-center gap-2">
          <ChannelMark channel={channel} size={18} />
          {label}
        </h3>
        <VersionState state={state} />
      </div>

      {/* Above the editor, because a post that is already live changes what the
          writer is doing: they are looking at what went out, not drafting it. */}
      <LiveLink channel={channel} permalink={state.permalink} />

      {!spec.publishable ? (
        <p className="flex items-start gap-2 rounded-sm bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
          <EyeOff size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {label} is preview-only in Alpha. Sahoda can draft and check this copy, but nothing here
            can publish it.
          </span>
        </p>
      ) : null}

      <div className="space-y-1.5">
        {/* The label carries the channel, so four boxes on one screen have four
            different accessible names. "Copy" rather than "Body": the post has a
            body, and each channel has a version of it. */}
        <label htmlFor={`variant-${channel}`} className="sr-only">
          {label} copy
        </label>
        <Textarea
          id={`variant-${channel}`}
          data-variant-editor={channel}
          value={state.body}
          error={meter.violations.length > 0}
          rows={6}
          placeholder={`Write the ${label} version…`}
          onChange={(event) => onBodyChange(event.target.value)}
          onSelect={captureSelection}
        />
      </div>

      <ChannelMeterView meter={meter} fixes={fixes} />

      {hashtags !== undefined && hashtags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-pill bg-s2 px-2.5 py-1 text-[12px] font-semibold text-ink"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* Per channel, on this channel's own text. The splice runs against the
          CURRENT body, not the one captured when the rewrite was requested: the
          box stays editable while the model works, and splicing a stale string
          back would silently drop whatever was typed in the meantime. */}
      <InlineRewrite
        body={state.body}
        selection={selection}
        onReplace={(range, replacement, expected) => {
          if (selectedText(state.body, range) !== expected) return false
          onBodyChange(spliceSelection(state.body, range, replacement))
          setSelection(null)
          return true
        }}
      />

      <VersionOptions
        channel={channel}
        format={format}
        onFormatChange={onFormatChange}
        extras={state.extras}
        onExtrasChange={onExtrasChange}
      />

      {/* ── ONLY ONE OF THE TWO EVER SHOWS ──────────────────────────────────────
          A clash is not an error and must not be dressed as one: the writer has a
          choice to make, and `use-variants` clears `error` whenever it sets
          `conflict` so the two cannot stack. */}
      {state.conflict !== null ? (
        <VariantConflictNotice
          conflict={state.conflict}
          onKeepMine={onKeepMine}
          onUseTheirs={onUseTheirs}
        />
      ) : null}

      {state.error !== null ? <InlineError>{state.error}</InlineError> : null}

      {/* Below the editor and the options, above Save: relinking replaces what
          is in the box, so it belongs next to the decision to keep it, not next
          to the words it would overwrite. */}
      <RelinkControl
        label={label}
        state={state}
        canonicalBody={canonicalBody}
        onRelink={onRelink}
        onUndo={onUndoRelink}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Save ${label} copy`}
          onClick={onSave}
          loading={state.saving}
          disabled={!state.dirty || state.body === ''}
        >
          Save
        </Button>
        {state.body === '' ? (
          <span className="text-[12px] text-muted">
            Nothing to save — this channel has no copy.
          </span>
        ) : null}
      </div>
    </section>
  )
}
