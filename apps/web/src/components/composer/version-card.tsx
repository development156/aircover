'use client'

import { useState } from 'react'
import { EyeOff } from 'lucide-react'
import { CONSTRAINTS, type Channel, type PostMedia } from '@sahoda/shared'
import { refuseFormat, refuseFormatMedia, type PostFormat } from '@sahoda/publishing/format'

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
import { asThread, previewThread } from '@/lib/posts/thread-preview'
import { selectedText, spliceSelection, type SelectionRange } from '@/lib/posts/splice-selection'
import type { VariantExtras } from '@/lib/posts/variant-extras'
import type { VariantState } from '@/components/posts/use-variants'

import { HashtagField } from './hashtag-field'
import { RelinkControl } from './relink-control'
import { trimToFit } from './trim-to-fit'
import { ThreadPreviewView } from './thread-preview'
import { VersionOptions } from './version-options'
import { VersionState } from './version-state'

export interface VersionCardProps {
  channel: Channel
  state: VariantState
  /**
   * The files on the POST — every channel is scored against the same set.
   *
   * The ROWS, not a count, and that is the fix for a real fake-green: attach a
   * landscape photo while this card says "One photo" (legal — it is inside
   * Instagram's feed range), then change the card to "A story". Attach-time
   * validation has already run and never runs again, so the card stayed green on
   * a payload Instagram refuses. `post_media` carries `width` and `height`, so
   * the answer was one component away the whole time.
   *
   * Publishing genuinely cannot make this check — `PublishRequestMedia` has no
   * pixels — which is exactly why the editor must not be the only place it could
   * have been made and wasn't.
   */
  media: readonly PostMedia[]
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
  media,
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
  const mediaCount = media.length

  // ── THE FORMAT'S SHAPE RULE, RE-RUN WHENEVER THE FORMAT CHANGES ─────────────
  // `decideAttach` checks a file against the format in force AT ATTACH TIME.
  // Changing the format afterwards changes the rule, and nothing re-ran it. This
  // scores the files already on the post against the format on THIS card, so the
  // verdict follows the choice rather than the upload.
  //
  // First offender only: four cards each listing the same three bad photos is
  // the wall of text docs/27 §1 is about, and one sentence is enough to send the
  // writer to the media well.
  const shapeRefusal =
    media
      .map((row) =>
        refuseFormatMedia(spec, format, {
          ...(row.width === null ? {} : { width: row.width }),
          ...(row.height === null ? {} : { height: row.height }),
        }),
      )
      .find((refusal) => refusal !== null) ?? null

  const draft = {
    body: state.body,
    hashtags,
    hasLink: hasLink(state.body),
    mediaCount,
  }

  // ── THE POSTS THIS BECOMES, WHEN IT BECOMES MORE THAN ONE ───────────────────
  // Null for every version that is not a thread, which is the signal the preview
  // and the meter both read — an absent plan cannot be rendered by accident.
  const thread = previewThread(channel, draft, format === 'thread')

  // ── THREE VERDICTS, IN THE ORDER THE PUBLISHER ASKS THEM ────────────────────
  // `asThread` is OUTERMOST because it is the one that removes a rule rather than
  // adding one: for a thread the whole-body character limit is the wrong
  // question, and it must come out after everything that could have added to it.
  // It removes exactly MAX_CHARS and nothing else, the same single swap
  // `runPublishPost` makes — so a thread with too many hashtags is still red.
  const meter = asThread(
    withFormat(
      withFormat(meterFor(channel, draft), refuseFormat(spec, format, mediaCount)),
      shapeRefusal,
    ),
    thread,
  )

  // MAX_MEDIA_COUNT deliberately gets no entry. Media lives on the post and this
  // card cannot detach a file, so a "Remove extra media" button would do nothing;
  // `ChannelMeterView` renders the label as plain text when no handler exists,
  // which states the problem without faking an affordance.
  const fixes: Partial<Record<string, () => void>> = {
    // Absent for a thread: `asThread` has already removed MAX_CHARS, so this key
    // is unreachable there — and offering "Trim to fit" on a legal seven-post
    // thread would tell the writer to cut words that do not need cutting.
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

      {/* Directly under the meter, because the meter's numbers are now ABOUT the
          split — for a thread it reads "the longest post / one post's limit" —
          and a reader needs the posts in front of them for that to mean anything.
          Renders nothing when this version is not a thread. */}
      {thread !== null ? <ThreadPreviewView preview={thread} /> : null}

      <HashtagField
        channel={channel}
        label={label}
        hashtags={hashtags}
        onChange={(next) => onExtrasChange({ hashtags: next })}
      />

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
        mediaCount={mediaCount}
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
