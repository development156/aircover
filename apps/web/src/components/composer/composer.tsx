'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel, ChannelSet, Post, PostMedia, PostVariant } from '@sahoda/shared'
import type { PostFormat } from '@sahoda/publishing/format'

import { createPost } from '@/app/actions/posts'
import { selectStatusRows, variantStatusRows } from '@/lib/posts/variant-status'
import { useAutosave } from '@/components/posts/use-autosave'
import { useLivePost } from '@/components/posts/live/publish-state-provider'
import { useVariants } from '@/components/posts/use-variants'
import { VERSIONS_UNSUPPORTED, type VariantVersions } from '@/lib/posts/variant-version'
import type { MediaPreview } from '@/lib/posts/media-url'
import type { TemplatesRead } from '@/lib/templates/read'

import { CommitBar } from './commit-bar'
import { ComposerHeader } from './composer-header'
import { DivergenceNotice } from './divergence-notice'
import { FinishPanel } from './finish-panel'
import { ExtrasPane } from './extras-pane'
import { WritingPane } from './writing-pane'
import { useComposerActions } from './use-composer-actions'
import { useVariantFormat } from './use-variant-format'
import { VersionsPane } from './versions-pane'

export interface ComposerProps {
  /** The row, or null when this post does not exist yet. */
  post: Post | null
  variants: PostVariant[]
  versions?: VariantVersions
  formats?: Partial<Record<Channel, PostFormat>>
  media: PostMedia[]
  previews?: MediaPreview[]
  /** `assets.title` by `storage_path`, for attachments that came from the library. */
  libraryNames?: Record<string, string>
  templates: TemplatesRead
  /** Whether the scheduled dispatcher is on HERE. Server fact; false under-promises. */
  autoPublish?: boolean
  /** Channels with a live connection. `undefined` means the read failed — see below. */
  connected?: ReadonlySet<Channel>
}

/**
 * THE COMPOSER. One screen for writing a post, whether or not it exists yet.
 *
 * ── WHAT THIS REPLACED, AND WHY BOTH HAD TO GO ───────────────────────────────
 * There were two editors. `/create/post` was a five-step wizard that could not
 * generate variants; `/posts/[id]` was a three-pane editor that could not be
 * reached without a row already existing. Neither was wrong on its own terms —
 * they were built to different briefs — and that is the point: a writer met one
 * of them by accident depending on which link they clicked.
 *
 * ── THE ONE THING THE DESIGN IS BUILT AROUND ─────────────────────────────────
 * ONE BODY PER CHANNEL. Instagram's caption is not LinkedIn's; each has its own
 * limit, its own rules and its own publish state, and each publishes on its own.
 * So the per-channel versions are the CENTRE of the screen — a stack the writer
 * scrolls through — not a side panel and not a tab strip that hides three of four.
 *
 * ── THE SOURCE AND THE VERSIONS ARE LINKED UNTIL THEY ARE NOT ────────────────
 * A channel nobody has written follows the post: the body is mirrored into its
 * draft as the writer types, and the card says both that it follows and that the
 * mirrored text is not in the row yet. Typing into a version ends that for good.
 * The mirror is real state, not a display trick, because `runPublishPost` sends
 * `post_variants.body` and has no fallback — showing the post's words in an empty
 * channel box would describe a publish that cannot happen.
 */
export function Composer({
  post,
  variants,
  versions = VERSIONS_UNSUPPORTED,
  formats: initialFormats = {},
  media,
  previews = [],
  libraryNames = {},
  templates,
  autoPublish = false,
  connected,
}: ComposerProps) {
  /**
   * The row this composer is writing to.
   *
   * Starts null for a new post and is filled by the first save — see
   * `ensurePostId`. Mirrored into a ref because callers that run inside an async
   * callback (generate, publish) need the CURRENT id, not the one captured when
   * their button rendered.
   */
  const [postId, setPostId] = useState<string | null>(post?.id ?? null)
  const postIdRef = useRef<string | null>(postId)

  /**
   * Create the row, once, on the first save that has something to write.
   *
   * NOT on mount. Opening a screen is not intent, and creating on open is what
   * left "Untitled post" debris behind every abandoned click.
   *
   * This does NOT touch the address bar — see the effect below for why.
   */
  const ensurePostId = useCallback(async () => {
    if (postIdRef.current !== null) return { ok: true as const, postId: postIdRef.current }
    const created = await createPost('')
    if (!created.ok) return { ok: false as const, message: created.message }
    postIdRef.current = created.postId
    setPostId(created.postId)
    return { ok: true as const, postId: created.postId }
  }, [])

  const autosave = useAutosave(postId, post, ensurePostId)

  /**
   * ── THE ADDRESS CHANGES ONLY ONCE THERE IS SOMETHING AT IT ──────────────────
   * MEASURED: rewriting the URL inside `ensurePostId` puts `/posts/<id>` in the
   * address bar while the save that created the row is still in flight —
   * `createPost` runs first and `savePost` carries the title, body and CHANNELS.
   * Reload in that window (or, in a browser test, navigate straight to the new
   * address) and the row is real but empty: no channels, so no version cards, so
   * the writer's first choice is silently gone.
   *
   * So the rewrite waits for the save to be confirmed. The id appearing in the
   * address bar then means what it looks like it means.
   *
   * `window.history.replaceState`, never `router.replace`: MEASURED in the
   * deleted create flow, a replace re-renders the route and would remount this
   * component mid-sentence. The History API is supported directly by the App
   * Router and rewrites the address with no navigation and no server round trip.
   */
  useEffect(() => {
    if (postId === null || autosave.status !== 'saved') return
    const href = `/posts/${postId}`
    if (window.location.pathname === href) return
    window.history.replaceState(window.history.state, '', href)
  }, [postId, autosave.status])
  /**
   * A GETTER, not the id.
   *
   * A variant save can be triggered in the same tick the row is created — press
   * Save on a brand new post and `ensurePostId` runs inside the flush that
   * precedes it. React state does not update mid-callback, so a `postId` captured
   * at render time would still be null there and the save would write nowhere.
   * The ref is set synchronously by `ensurePostId`, so reading it at call time is
   * the only version of this that cannot be stale.
   */
  const readPostId = useCallback(() => postIdRef.current, [])
  const variantsApi = useVariants(readPostId, variants, versions, post?.body ?? '')
  /**
   * Which channels already have a row. Computed from the rows this page loaded,
   * NOT from `live.variants`: a channel whose row appeared while the writer was
   * typing is still one they never chose a format for in this session, and
   * widening this set mid-sentence would silently stop seeding it.
   */
  const existingVariantChannels = useRef<ReadonlySet<Channel>>(
    new Set(variants.map((v) => v.channel)),
  )
  const formats = useVariantFormat(postId, initialFormats, existingVariantChannels.current)

  const { draft } = autosave

  /**
   * Server-owned publish state, straight off the rows — deliberately NOT from
   * `variantsApi`, which holds the writer's unsaved drafts. What a channel is
   * doing on a platform is not something the composer may have an opinion about.
   *
   * Feeding a fresh post row back into this component would be actively harmful:
   * `useAutosave` raises the "someone else changed this post" notice whenever
   * `updated_at` moves past the timestamp it adopted, and a publish bumps
   * `updated_at` on every status change — so the publisher would be reported as
   * another person editing, on a loop, while the writer is mid-sentence.
   */
  const live = useLivePost(postId ?? '')
  // Filtered to THIS post's channels either way: `live.variants` arrives
  // unfiltered and a variant row survives the writer deselecting its channel, so
  // handing it over wholesale would widen the list the moment the first poll landed.
  const statusRows = live
    ? selectStatusRows(draft.channels, live.variants)
    : variantStatusRows(draft.channels, variants)

  const actions = useComposerActions(autosave, variantsApi, formats, draft.channels, postIdRef)

  // ── WHERE THE ONE PRIMARY ACTION IS, RIGHT NOW ──────────────────────────────
  // docs/26 §1.5 allows one per view, and on this screen the next thing to do
  // genuinely changes as the work progresses. Adapting is the primary until every
  // selected channel has copy of its own; after that it is a repeat, and the only
  // primary left is publishing, which lives in `FinishPanel`.
  const everyChannelWritten =
    draft.channels.length > 0 &&
    draft.channels.every((channel) => !variantsApi.states[channel].following)

  return (
    <div className="space-y-grid" data-composer data-guide="post-editor">
      <DivergenceNotice
        divergence={autosave.divergence}
        onLoadTheirs={autosave.loadTheirs}
        onKeepMine={autosave.keepMine}
        error={autosave.error}
        onRetry={() => void autosave.flush()}
      />

      <ComposerHeader
        title={draft.title}
        onTitleChange={(title) => autosave.update({ title })}
        channels={draft.channels}
        onChannelsChange={(channels: ChannelSet) => {
          autosave.update({ channels })
          // A channel the writer has just ticked opens on the kind of post that
          // channel usually carries — words everywhere except Instagram, which
          // has no text-only post. Derived from `requiresMedia`, never tabulated.
          formats.seedNew(channels)
        }}
        connected={connected}
      />

      {/* ── THE ORDER IS THE ARGUMENT, AND IT HOLDS AT EVERY WIDTH ──────────
          One column: write it, see each version, then attach and reuse. Two
          columns: the versions take the whole right side and the writing sits
          above the extras on the left. Explicit grid placement rather than two
          wrapper divs, because the versions have to come BETWEEN the other two
          when they stack — MEASURED at 768px with a single left pane, the only
          thing on this screen no competitor has was the last thing on the page,
          below an empty media well. */}
      <div className="grid items-start gap-grid wide:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="wide:col-start-1 wide:row-start-1">
          <WritingPane
            body={draft.body}
            onBodyChange={(body) => {
              autosave.update({ body })
              // Every channel still following moves with it. Channels written
              // independently are left exactly as they are.
              variantsApi.mirrorSource(body)
            }}
          />
        </div>

        <div className="wide:col-start-2 wide:row-span-2 wide:row-start-1">
          <VersionsPane
            channels={draft.channels}
            canonicalBody={draft.body}
            variants={variantsApi}
            formats={formats}
            media={media}
            flush={actions.flushAndResolve}
            onGenerated={variantsApi.applyGenerated}
            generateIsPrimary={!everyChannelWritten}
            onSaved={(channel) => void actions.saveVersion(channel)}
          />
        </div>

        <div className="wide:col-start-1 wide:row-start-2">
          <ExtrasPane
            body={draft.body}
            onBodyChange={(body) => {
              autosave.update({ body })
              variantsApi.mirrorSource(body)
            }}
            channels={draft.channels}
            postId={postId}
            media={media}
            previews={previews}
            libraryNames={libraryNames}
            templates={templates}
          />
        </div>
      </div>

      <FinishPanel
        postId={postId}
        channels={draft.channels}
        scheduledAt={draft.scheduledAt}
        onScheduleChange={actions.changeSchedule}
        scheduleError={actions.scheduleError}
        autoPublish={autoPublish}
        connected={connected}
        statusRows={statusRows}
        flush={actions.flush}
        saveVariantNow={actions.saveVersion}
      />

      <CommitBar
        status={autosave.status}
        unsavedVersions={actions.unsaved.length}
        savingVersions={actions.savingAll}
        onSaveAll={actions.saveAll}
        canFinish={draft.channels.length > 0}
      />
    </div>
  )
}
