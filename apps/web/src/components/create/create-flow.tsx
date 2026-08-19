'use client'

import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Image as ImageIcon, MapPin, SquarePen } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { CONSTRAINTS, type Channel, type ChannelSet } from '@sahoda/shared'
import type { PostMedia } from '@sahoda/shared'

import { createPost, savePost, saveVariant } from '@/app/actions/posts'
import { ComingSoonTile } from '@/components/create/coming-soon-tile'
import { StepIndicator } from '@/components/create/step-indicator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/posts/inline-error'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { MediaPane } from '@/components/posts/media-pane'
import type { MediaPreview } from '@/lib/posts/media-url'
import { VariantConflictNotice } from '@/components/posts/variant-conflict-notice'
import type { SaveConflict } from '@/lib/posts/state'
import {
  expectedVersionFor,
  VERSIONS_UNSUPPORTED,
  type VariantVersions,
} from '@/lib/posts/variant-version'

/**
 * The five-step create flow, as FULL-SCREEN PAGES, backed by a real row.
 *
 * ── WHY NOT THE REFERENCE'S MODAL ────────────────────────────────────────────
 * The reference's Content step has ONE body — a single textarea and a single
 * 2200 counter — and per-channel copy appears only as read-only previews. This
 * product stores one body PER CHANNEL in `post_variants`, each with its own
 * limit and its own publish_status, so a modal has nowhere to put four editors
 * beside four previews. The divergence is the requirement.
 *
 * ── WHERE THE WORK LIVES ─────────────────────────────────────────────────────
 * In the database, from the moment the person commits to a set of channels.
 * The flow previously held everything in React, so a reload threw the writing
 * away. Now `Continue` on step 1 creates the row, the id travels in `?post=`,
 * and each channel's body is written to its OWN `post_variants` row through
 * `saveVariant`. Reload rehydrates from those rows.
 *
 * The row is created on the FIRST continue, not on the button that opens the
 * flow: opening a screen is not intent, and creating on open is what left
 * "Untitled post" debris behind every abandoned click.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 * Publish. `savePost` does not accept `status` — deliberately, see its own note
 * — so nothing here can mark a post published, and Publish now is rendered
 * disabled with the reason stated. It renders no predicted reach, no template
 * count, no peak-time window and no revenue share, because no query in this
 * codebase can produce any of them.
 */

const STEPS = ['Channel', 'Format', 'Content', 'Preview', 'Schedule'] as const
type StepKey = 'channel' | 'format' | 'content' | 'preview' | 'schedule'
const ORDER: readonly StepKey[] = ['channel', 'format', 'content', 'preview', 'schedule']

/** The four channels with adapters, in the reference's reading order. */
const REAL_CHANNELS: readonly Channel[] = ['instagram', 'linkedin', 'x', 'gbp']

/** Channels the reference shows that this product cannot publish to yet. */
const SOON_CHANNELS: readonly { key: string; label: string; mark: string }[] = [
  { key: 'facebook', label: 'Facebook', mark: '/channels/facebook.png' },
  { key: 'tiktok', label: 'TikTok', mark: '/channels/tiktok.png' },
  { key: 'youtube', label: 'YouTube', mark: '/channels/youtube.png' },
  { key: 'whatsapp', label: 'WhatsApp', mark: '/channels/whatsapp.png' },
  { key: 'telegram', label: 'Telegram', mark: '/channels/telegram.png' },
]

const MARK: Partial<Record<Channel, string>> = {
  instagram: '/channels/instagram.png',
  linkedin: '/channels/linkedin.png',
  x: '/channels/x.png',
}

/** GBP ships no mark in the package; google-ads.png is a different product. */
function ChannelMark({ channel, size = 22 }: { channel: Channel; size?: number }) {
  const src = MARK[channel]
  if (!src) {
    return (
      <span
        aria-hidden
        data-channel={channel}
        className="grid shrink-0 place-items-center rounded-sm bg-s2 text-muted"
        style={{ width: size, height: size }}
      >
        <MapPin size={Math.round(size * 0.62)} strokeWidth={1.8} />
      </span>
    )
  }
  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      data-channel={channel}
      width={size}
      height={size}
      className="shrink-0 rounded-sm"
    />
  )
}

export function CreateFlow({
  connected,
  postId: initialPostId,
  initialChannels,
  initialBodies,
  initialScheduledAt,
  media,
  previews,
  postChannels,
  versions = VERSIONS_UNSUPPORTED,
}: {
  connected: readonly Channel[]
  postId: string | null
  initialChannels: readonly Channel[]
  initialBodies: Record<string, string>
  initialScheduledAt: string | null
  media: PostMedia[]
  previews: MediaPreview[]
  /** The post's OWN channels, branded. MediaPane validates attachments per channel. */
  postChannels: ChannelSet | null
  /**
   * What each channel's stored copy is at, so a save can compare against it.
   *
   * Defaults to "not tracked", which is production's answer until migration
   * 20260819000000 is applied — and with it every save here behaves exactly as it
   * does today.
   */
  versions?: VariantVersions
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // `useSearchParams`, NOT a one-time read of window.location.
  //
  // This read `window.location.search` during render for one revision, and the
  // step froze on its first value: router.push changed the URL, the server
  // re-rendered, and this component kept showing step 1 because an imperative
  // location read is not a reactive dependency and nothing told React to run
  // again. The hook subscribes; the raw read does not.
  const params = useSearchParams()
  const step = params.get('step') ?? 'channel'
  const current: StepKey = (ORDER as readonly string[]).includes(step)
    ? (step as StepKey)
    : 'channel'
  const index = ORDER.indexOf(current)

  const [postId, setPostId] = useState<string | null>(initialPostId)
  const [channels, setChannels] = useState<Channel[]>([...initialChannels])
  const [bodies, setBodies] = useState<Record<string, string>>(initialBodies)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  /**
   * What each channel's row is at, and the clash if one has been refused.
   *
   * ── WHY THE CREATE FLOW NEEDS THIS AT ALL ────────────────────────────────────
   * This is where the loss was actually MEASURED (docs/23): two tabs on the same
   * post's Content step, both typing, both blurring, and the second one wins with
   * neither told. The editor next door had at least a divergence notice for the
   * canonical body; this screen had nothing for any of it.
   *
   * Held in a ref rather than state because `persistVariant` runs inside a
   * transition and from an unmount cleanup, and both need the CURRENT number at
   * call time — a state updater is not guaranteed to have run by then. The
   * conflicts are state, because they are rendered.
   */
  const variantVersions = useRef<Partial<Record<Channel, number | null | undefined>>>(
    Object.fromEntries(REAL_CHANNELS.map((c) => [c, expectedVersionFor(versions, c)])),
  )
  const [conflicts, setConflicts] = useState<Partial<Record<Channel, SaveConflict>>>({})

  const connectedSet = new Set(connected)

  // typedRoutes cannot narrow a template literal that carries a runtime id, so
  // the cast is made ONCE here rather than at each call site. The route half is
  // still a literal the manifest checks; only the query string is dynamic.
  function href(next: StepKey, id: string | null): Route {
    return `/create/post?step=${next}${id ? `&post=${id}` : ''}` as Route
  }

  /**
   * Move forward, creating or updating the row first.
   *
   * The channel set is written on EVERY forward move from step 1, not only the
   * first: someone who walks back and changes their mind must not leave the row
   * claiming the old channels.
   */
  function advance() {
    setError(null)
    const next = ORDER[index + 1]
    if (!next) return

    if (current !== 'channel') {
      router.push(href(next, postId))
      return
    }

    startTransition(async () => {
      let id = postId
      if (!id) {
        const created = await createPost('')
        if (!created.ok) {
          setError(created.message)
          return
        }
        id = created.postId
        setPostId(id)
      }
      const saved = await savePost(id, { channels })
      if (!saved.ok) {
        setError(saved.message)
        return
      }
      /**
       * STAMP THE ID ON THE ENTRY THEY WILL COME BACK TO, before pushing the
       * next one.
       *
       * MEASURED: step 1 → Continue creates post A and pushes
       * `?step=format&post=A`, but the entry underneath is still the bare
       * `/create/post` from before A existed. Press Back and then reload — a
       * phone restoring a tab does exactly this — and the flow starts blank,
       * Continue creates post B, and A is orphaned with whatever was written on
       * it. Two drafts, and the half they can see is the empty one.
       *
       * `window.history.replaceState`, NOT `router.replace`. MEASURED: a
       * `router.replace` immediately followed by `router.push` leaves the Back
       * entry unchanged — the two navigations collapse into the push and the
       * entry underneath is still the bare `/create/post`. The history API is
       * supported directly by the App Router (Next 15) and is what this needs:
       * rewrite the address of the entry we are standing on, with no navigation,
       * no server round trip and no re-render, then push the next one.
       */
      window.history.replaceState(window.history.state, '', href('channel', id))
      router.push(href(next, id))
    })
  }

  /** Persist one channel's body to its OWN variant row. Never a shared field. */
  function persistVariant(channel: Channel, body: string) {
    if (!postId) return
    startTransition(async () => {
      const result = await saveVariant(postId, channel, body, {}, variantVersions.current[channel])
      if (!result.ok) {
        // ── A CLASH IS NOT A SAVE ERROR ───────────────────────────────────────
        // The generic error line says "could not save" and offers nothing to do
        // about it. A clash has two real choices and both of them keep the text,
        // so it gets the notice instead — and the version the refusal carried is
        // adopted, which is what lets "Keep mine" win rather than fail forever.
        if (result.conflict) {
          variantVersions.current[channel] = result.conflict.version
          setConflicts((prev) => ({ ...prev, [channel]: result.conflict }))
          setError(null)
          return
        }
        setError(result.message)
        return
      }
      // `version` is absent on a database without the column, and absent must
      // leave `undefined` standing — writing it in would make the next save claim
      // to compare against something this database does not have.
      if (result.version !== undefined) variantVersions.current[channel] = result.version
      setConflicts((prev) => {
        if (prev[channel] === undefined) return prev
        const next = { ...prev }
        delete next[channel]
        return next
      })
      setError(null)
      setSavedAt(new Date().toISOString())
    })
  }

  /**
   * ── BLUR WAS THE ONLY SAVE, AND A BACK PRESS DOES NOT BLUR ───────────────────
   * MEASURED: 100 characters typed into the Instagram body, browser Back, then
   * Forward — 65 came back. The 35 typed since the last blur were gone, and gone
   * for good, because Forward re-reads the row. On a phone that is the swipe-back
   * gesture, which is how people leave a screen.
   *
   * The comment on this page still says the flow is "backed by a real row" so a
   * reload cannot discard what was written. That was only ever true of text the
   * customer had blurred out of.
   *
   * Two triggers now, and the pair is the point:
   *  · a 2s debounce while typing, matching the editor's own autosave, so a
   *    pause is enough to make the work durable;
   *  · a flush when this component goes away, which is what a Back press
   *    actually does in a client-routed app — no unload event fires, so
   *    `pagehide` would never have caught it.
   *
   * Still one row write per edit session in the common case: the timer is reset
   * on every keystroke, so a continuous typist writes once when they pause.
   */
  const AUTOSAVE_MS = 2000
  /** Latest unsaved body per channel, with its pending timer. */
  const unsaved = useRef(new Map<Channel, { body: string; timer: ReturnType<typeof setTimeout> }>())

  function clearPending(channel: Channel) {
    const entry = unsaved.current.get(channel)
    if (entry) {
      clearTimeout(entry.timer)
      unsaved.current.delete(channel)
    }
  }

  /** Debounced write. Called on every keystroke; fires once the typing stops. */
  function scheduleVariant(channel: Channel, body: string) {
    clearPending(channel)
    const timer = setTimeout(() => {
      unsaved.current.delete(channel)
      persistVariant(channel, body)
    }, AUTOSAVE_MS)
    unsaved.current.set(channel, { body, timer })
  }

  /** Immediate write, cancelling any pending one for the same channel. */
  function commitVariant(channel: Channel, body: string) {
    clearPending(channel)
    persistVariant(channel, body)
  }

  /**
   * Flush on the way out. Deliberately calls the action DIRECTLY rather than
   * through `startTransition` and `persistVariant`: this runs during teardown,
   * when setting state is both pointless and a warning. The request is already
   * in flight by the time React finishes unmounting — an SPA back does not tear
   * the page down, so it completes.
   *
   * The ref is read inside the cleanup, so it carries the LAST body typed rather
   * than whatever was current when the effect was created.
   */
  const flushRef = useRef<() => void>(() => {})
  flushRef.current = () => {
    for (const [channel, entry] of unsaved.current) {
      clearTimeout(entry.timer)
      if (postId) void saveVariant(postId, channel, entry.body, {})
    }
    unsaved.current.clear()
  }
  useEffect(() => () => flushRef.current(), [])

  const canContinue = current !== 'channel' || channels.length > 0

  return (
    <div className="space-y-grid" data-guide="create.flow">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[20px] leading-7 font-[650] tracking-[-0.02em]">New post</h1>
          <p className="mt-[1px] text-[13px] text-muted">
            Step {index + 1} of 5 · {STEPS[index]}
            {savedAt ? <span data-saved> · Saved</span> : null}
          </p>
        </div>
        {/* SPECIFICATION.md §10: 44px tap targets on a phone, dense on desktop. */}
        <Link
          href={postId ? `/posts/${postId}` : '/posts'}
          className="-mx-2 inline-flex items-center rounded-sm px-2 text-[13px] font-semibold text-muted transition-micro hover:text-ink max-narrow:min-h-[44px]"
        >
          {postId ? 'Open in editor' : 'Cancel'}
        </Link>
      </div>

      <StepIndicator steps={STEPS} current={index} />

      {error ? <InlineError>{error}</InlineError> : null}

      <div className="min-h-[320px]">
        {current === 'channel' ? (
          <StepChannel
            channels={channels}
            connectedSet={connectedSet}
            onToggle={(c) =>
              setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
            }
          />
        ) : null}
        {current === 'format' ? <StepFormat /> : null}
        {current === 'content' ? (
          <StepContent
            channels={channels}
            bodies={bodies}
            onChange={(ch, value) => {
              setBodies((prev) => ({ ...prev, [ch]: value }))
              scheduleVariant(ch, value)
            }}
            onCommit={commitVariant}
            conflicts={conflicts}
            onKeepMine={(ch) => commitVariant(ch, bodies[ch] ?? '')}
            onUseTheirs={(ch, theirs) => {
              // Into the box, never into the row — the notice's third rule. The
              // debounce is deliberately started rather than a write forced: the
              // writer can still edit or undo before anything lands, exactly as
              // if they had typed it themselves.
              setBodies((prev) => ({ ...prev, [ch]: theirs }))
              setConflicts((prev) => {
                const next = { ...prev }
                delete next[ch]
                return next
              })
              scheduleVariant(ch, theirs)
            }}
            postId={postId}
            media={media}
            previews={previews}
            postChannels={postChannels}
          />
        ) : null}
        {current === 'preview' ? <StepPreview channels={channels} bodies={bodies} /> : null}
        {current === 'schedule' ? (
          <StepSchedule
            postId={postId}
            initialScheduledAt={initialScheduledAt}
            onError={setError}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
        {index > 0 ? (
          <Button
            variant="secondary"
            className="max-narrow:min-h-[44px]"
            onClick={() => router.push(href(ORDER[index - 1]!, postId))}
          >
            <ArrowLeft size={15} strokeWidth={1.9} aria-hidden />
            Back
          </Button>
        ) : (
          <span />
        )}
        {index < ORDER.length - 1 ? (
          <Button
            variant="primary"
            className="max-narrow:min-h-[44px]"
            disabled={!canContinue}
            loading={pending}
            onClick={advance}
          >
            Continue
            <ArrowRight size={15} strokeWidth={1.9} aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/* ── 1 · CHANNEL ─────────────────────────────────────────────────────────────
   No "Pre-selected for you" panel. The reference's rationale reads "Instagram
   drives 38% of your revenue"; this product holds no revenue data at all, so
   there is nothing to select FROM and nothing true to say about why. */
function StepChannel({
  channels,
  connectedSet,
  onToggle,
}: {
  channels: readonly Channel[]
  connectedSet: ReadonlySet<Channel>
  onToggle: (c: Channel) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        Pick one or more channels. Each one gets its own copy, which you can edit separately.
      </p>

      <div className="grid grid-cols-4 gap-2 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {REAL_CHANNELS.map((channel) => {
          const on = channels.includes(channel)
          return (
            <button
              key={channel}
              type="button"
              data-channel-tile={channel}
              aria-pressed={on}
              onClick={() => onToggle(channel)}
              className={[
                'surface-ring flex items-center gap-2 rounded-card bg-surface px-3 py-3 text-left transition-micro max-narrow:min-h-[44px]',
                on ? 'bg-brand-wash shadow-[inset_0_0_0_1.5px_var(--brand)]' : 'hover:bg-s2',
              ].join(' ')}
            >
              <ChannelMark channel={channel} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-[550]">
                  {CHANNEL_LABELS[channel]}
                </span>
                <span className="block text-[11.5px] text-muted">
                  {connectedSet.has(channel) ? 'Connected' : 'Not connected · you can still write'}
                </span>
              </span>
              {on ? (
                <Check size={15} strokeWidth={2.4} className="shrink-0 text-accent" aria-hidden />
              ) : null}
            </button>
          )
        })}

        {/* `row`, because these share the grid above with the selectable channel
            tiles. Stacked, they rendered 110px against those tiles' 64px and the
            one grid read as two different components. */}
        {SOON_CHANNELS.map((c) => (
          <ComingSoonTile
            key={c.key}
            layout="row"
            icon={<Image src={c.mark} alt="" aria-hidden width={18} height={18} />}
            title={c.label}
          />
        ))}
      </div>

      {channels.length > 1 ? (
        <p className="text-[12.5px] text-muted">
          {channels.length} channels selected. Each one gets its own copy on the next screens.
        </p>
      ) : null}
    </div>
  )
}

/* ── 2 · FORMAT ──────────────────────────────────────────────────────────────
   ONE real format. packages/shared/src/publishing/constraints.ts has no format
   field: every channel's mediaTypes is image-only (x:121, gbp:133,
   linkedin:146, instagram:160 — no video mime anywhere) and PublishDraft
   (:53-63) is one shape per channel with no format discriminator. Validation
   branches on maxChars, maxMediaCount, requiresMedia and mediaTypes only. */
function StepFormat() {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        Choose a format. Each channel&rsquo;s limits are applied automatically.
      </p>

      <div className="grid grid-cols-5 gap-2 max-wide:grid-cols-3 max-narrow:grid-cols-1">
        <div
          data-format="post"
          aria-current="true"
          className="surface-ring flex flex-col items-start gap-2 rounded-card bg-brand-wash px-3 py-3 shadow-[inset_0_0_0_1.5px_var(--brand)]"
        >
          <span aria-hidden className="grid size-7 place-items-center text-accent">
            <SquarePen size={16} strokeWidth={1.7} />
          </span>
          <span className="text-[13px] font-semibold">Post</span>
          <span className="text-[11.5px] text-muted">Text and images</span>
          <Badge rung="active">Selected</Badge>
        </div>

        {['Carousel', 'Story', 'Reel', 'Video'].map((f) => (
          <ComingSoonTile key={f} icon={<ImageIcon size={16} strokeWidth={1.7} />} title={f} />
        ))}
      </div>

      <p className="text-[12.5px] text-muted">
        Post is the only format Sahoda publishes today. A post can carry more than one image on the
        channels that allow it.
      </p>
    </div>
  )
}

/* ── 3 · CONTENT ─────────────────────────────────────────────────────────────
   R1 LIVES HERE. One editable body per selected channel, each with its own
   Constraint Engine limit, each written to its OWN post_variants row on blur.
   The reference has one shared body; this deliberately does not. */
function StepContent({
  channels,
  bodies,
  onChange,
  onCommit,
  conflicts,
  onKeepMine,
  onUseTheirs,
  postId,
  media,
  previews,
  postChannels,
}: {
  channels: readonly Channel[]
  bodies: Record<string, string>
  onChange: (channel: Channel, value: string) => void
  onCommit: (channel: Channel, value: string) => void
  /** Channels another writer saved while this one was typing. Empty is the norm. */
  conflicts: Partial<Record<Channel, SaveConflict>>
  onKeepMine: (channel: Channel) => void
  onUseTheirs: (channel: Channel, theirs: string) => void
  postId: string | null
  media: PostMedia[]
  previews: MediaPreview[]
  postChannels: ChannelSet | null
}) {
  if (channels.length === 0) {
    return (
      <p className="text-[13px] text-muted">Pick a channel first and its editor appears here.</p>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── A DEEP LINK LANDS HERE WITH NOTHING BEHIND IT ────────────────────────
          `/create/post?step=schedule` with no `?post=` is a real address — a
          bookmark, a shared link, a phone restoring a tab whose id was dropped.
          MEASURED before this: the step rendered in full, "Schedule" was disabled
          under the words "Pick a date and time below first" — which is not why it
          was disabled and picking a time would not have helped — and "Save as
          draft" said "Already saved · open it in the editor" about a post that
          did not exist. Two false statements on one screen.

          The step still renders rather than redirecting: silently moving someone
          to step 1 hides what happened. It says what is missing instead. */}
      {postId === null ? (
        <p className="rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
          There&rsquo;s no post to schedule yet &mdash; this link skipped the start of the flow.{' '}
          <Link href="/create/post" className="font-semibold underline underline-offset-2">
            Start a post
          </Link>
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2 max-narrow:grid-cols-1">
        <div className="surface-ring rounded-card bg-surface px-3 py-3">
          <span className="block text-[13px] font-semibold">Start from scratch</span>
          <span className="mt-1 block text-[11.5px] text-muted">
            A blank editor for each channel
          </span>
        </div>
        {/* The rewrite tools live in the editor, where a text SELECTION exists to
            rewrite. Offering them here with nothing selected would be a control
            that cannot succeed. */}
        <div className="surface-ring rounded-card bg-surface px-3 py-3">
          <span className="block text-[13px] font-semibold">Rewrite with AI</span>
          <span className="mt-1 block text-[11.5px] text-muted">
            Select text in the editor after saving
          </span>
        </div>
        {/* The reference says "14 templates matched to your industry". There is
            no templates table, so the card exists and the COUNT does not. */}
        <ComingSoonTile title="Use a template" note="Starting points for common posts" />
      </div>

      {/* ── MEDIA ────────────────────────────────────────────────────────────
          The SAME MediaPane the editor uses, not a second implementation.
          MediaPane validates attachments against the post's own channels, so
          Instagram's requiresMedia and every channel's maxMediaCount are enforced
          here exactly as they are there — a separate panel would be a second
          opinion about the same rules.

          MediaPane ALREADY RENDERS GenerateImage (media-pane.tsx). This step used
          to mount a second one beside it in a 280px column, so the Content step
          showed "Describe the picture you want" and "Make an image · 6 credits"
          TWICE — MEASURED at x=315 and x=1067. Two copies of one spend control is
          worse than an unclear one: it invites the reader to wonder which of them
          charges. The reuse was right; mounting it twice was not.

          It needs a saved post to attach to, so before the row exists the panel
          says so rather than offering an upload that has nowhere to go. */}
      {postId && postChannels ? (
        <MediaPane media={media} channels={postChannels} postId={postId} previews={previews} />
      ) : (
        <p className="text-[12.5px] text-muted">
          Images can be added once the post is saved. Press Continue and come back.
        </p>
      )}

      {channels.map((channel) => {
        const value = bodies[channel] ?? ''
        const limit = CONSTRAINTS[channel].maxChars
        const over = value.length > limit
        return (
          <div key={channel} className="surface-ring rounded-card bg-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <ChannelMark channel={channel} size={18} />
              <label htmlFor={`create-variant-${channel}`} className="text-[13px] font-semibold">
                {CHANNEL_LABELS[channel]} copy
              </label>
            </div>
            <textarea
              id={`create-variant-${channel}`}
              data-variant-editor={channel}
              rows={5}
              value={value}
              // `onChange` now also schedules a debounced write — blur alone lost
              // everything typed since the last one to a browser Back. See
              // `scheduleVariant`.
              onChange={(e) => onChange(channel, e.target.value)}
              // Blur still writes IMMEDIATELY and cancels the pending timer, so
              // leaving the field is as durable as it has always been.
              onBlur={(e) => onCommit(channel, e.target.value)}
              placeholder={`Write the ${CHANNEL_LABELS[channel]} version.`}
              className="w-full rounded-input border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {/* Directly under the box the words were typed into, because the
                notice shows the OTHER text and the two have to be read together. */}
            {conflicts[channel] !== undefined ? (
              <div className="mt-2">
                <VariantConflictNotice
                  conflict={conflicts[channel]}
                  onKeepMine={() => onKeepMine(channel)}
                  onUseTheirs={(theirs) => onUseTheirs(channel, theirs)}
                />
              </div>
            ) : null}

            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-[11.5px] text-muted">
                {CONSTRAINTS[channel].requiresMedia === true
                  ? 'This channel needs at least one image.'
                  : ' '}
              </span>
              <span
                data-limit={channel}
                className={`text-[11.5px] tabular-nums ${over ? 'font-semibold text-danger' : 'text-muted'}`}
              >
                {value.length.toLocaleString('en-IN')} / {limit.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── 4 · PREVIEW ─────────────────────────────────────────────────────────── */
function StepPreview({
  channels,
  bodies,
}: {
  channels: readonly Channel[]
  bodies: Record<string, string>
}) {
  if (channels.length === 0) {
    return (
      <p className="text-[13px] text-muted">Pick a channel first and its preview appears here.</p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">This is how the post lands on each channel.</p>

      <div className="grid grid-cols-2 gap-3 max-narrow:grid-cols-1">
        {channels.map((channel) => (
          <div
            key={channel}
            data-preview={channel}
            className="surface-ring overflow-hidden rounded-card bg-surface"
          >
            <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
              <ChannelMark channel={channel} size={18} />
              <span className="text-[12.5px] font-semibold">{CHANNEL_LABELS[channel]}</span>
            </div>
            <div className="grid aspect-square place-items-center bg-s2 text-muted">
              <ImageIcon size={22} strokeWidth={1.5} aria-hidden />
            </div>
            <p className="px-3 py-3 text-[12.5px] whitespace-pre-wrap">
              {bodies[channel]?.trim() ? (
                bodies[channel]
              ) : (
                <span className="text-muted">Nothing written for this channel yet.</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* No prediction engine exists, and this is the screen where someone
          decides whether to publish — the worst possible place for a figure
          nothing measured. */}
      <ComingSoonTile
        title="Predicted performance"
        note="How this post is likely to do, before it goes out"
        className="w-full"
      />
    </div>
  )
}

/* ── 5 · SCHEDULE ────────────────────────────────────────────────────────────
   Save as draft and Schedule are wired. PUBLISH NOW IS NOT, and says so.

   A publish is irreversible and reaches a real account, and the cross-tenant
   pre-flight assertion — the workspace_id check before the Zernio call — does
   not exist yet. Until it does, this button stays inert rather than removed:
   deleting it would hide that publishing is the point of the product, while
   leaving it live would risk one workspace's content on another's feed. */
function StepSchedule({
  postId,
  initialScheduledAt,
  onError,
}: {
  postId: string | null
  initialScheduledAt: string | null
  onError: (message: string | null) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [when, setWhen] = useState<string>(
    initialScheduledAt ? initialScheduledAt.slice(0, 16) : '',
  )
  const [done, setDone] = useState<string | null>(null)

  function schedule() {
    if (!postId || !when) return
    onError(null)
    startTransition(async () => {
      const at = new Date(when)
      const result = await savePost(postId, { scheduled_at: at.toISOString() })
      if (!result.ok) {
        onError(result.message)
        return
      }
      setDone('Scheduled')
    })
  }

  return (
    <div className="space-y-4">
      {/* ── A DEEP LINK LANDS HERE WITH NOTHING BEHIND IT ────────────────────────
          `/create/post?step=schedule` with no `?post=` is a real address — a
          bookmark, a shared link, a phone restoring a tab whose id was dropped.
          MEASURED before this: the step rendered in full, "Schedule" was disabled
          under the words "Pick a date and time below first" — which is not why it
          was disabled and picking a time would not have helped — and "Save as
          draft" said "Already saved · open it in the editor" about a post that
          did not exist. Two false statements on one screen.

          The step still renders rather than redirecting: silently moving someone
          to step 1 hides what happened. It says what is missing instead. */}
      {postId === null ? (
        <p className="rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
          There&rsquo;s no post to schedule yet &mdash; this link skipped the start of the flow.{' '}
          <Link href="/create/post" className="font-semibold underline underline-offset-2">
            Start a post
          </Link>
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2 max-narrow:grid-cols-1">
        {/* Publish now — present, inert, and honest about why. */}
        <div
          data-publish-disabled
          className="is-proposed flex flex-col items-start gap-1.5 rounded-card px-3 py-3"
        >
          <span className="text-[13px] font-semibold text-muted">Publish now</span>
          <span className="text-[11.5px] text-muted">
            Turned off in this build while the cross-workspace safety check is finished.
          </span>
          <Badge rung="calm" hideGlyph>
            Not available yet
          </Badge>
        </div>

        <button
          type="button"
          data-action="schedule"
          disabled={!postId || !when || pending}
          onClick={schedule}
          className="surface-ring rounded-card bg-surface px-3 py-3 text-left transition-micro hover:bg-s2 disabled:opacity-60 max-narrow:min-h-[44px]"
        >
          <span className="block text-[13px] font-semibold">Schedule</span>
          <span className="mt-1 block text-[11.5px] text-muted">
            {/* The reason has to be the REAL one. A disabled control that blames
                the wrong thing sends the customer to fix something that was
                never the problem. */}
            {postId === null
              ? 'There is no post to schedule'
              : when
                ? 'Save this time on the post'
                : 'Pick a date and time below first'}
          </span>
        </button>

        <Link
          href={postId ? `/posts/${postId}` : '/posts'}
          data-action="draft"
          className="surface-ring rounded-card bg-surface px-3 py-3 text-left transition-micro hover:bg-s2 max-narrow:min-h-[44px]"
        >
          <span className="block text-[13px] font-semibold">
            {postId === null ? 'Back to your posts' : 'Save as draft'}
          </span>
          <span className="mt-1 block text-[11.5px] text-muted">
            {/* "Already saved" is a claim, and with no post there is nothing it
                could be true of. */}
            {postId === null ? 'Nothing was started here' : 'Already saved · open it in the editor'}
          </span>
        </Link>
      </div>

      <div className="surface-ring rounded-card bg-surface p-3">
        <label htmlFor="create-when" className="block text-[12.5px] font-semibold">
          When
        </label>
        <input
          id="create-when"
          data-when
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="mt-2 rounded-input border border-line bg-bg px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring max-narrow:min-h-[44px]"
        />
        {/* The reference badges this field "AI recommended" and says "audience
            peaks between 9:40 and 10:20". No timing analysis exists here, so
            there is no badge and no window. */}
        <p className="mt-2 text-[12.5px] text-muted">
          Sahoda does not suggest a time yet. Pick whatever suits you.
        </p>
        {done ? (
          <p data-scheduled className="mt-2 text-[12.5px] font-semibold text-accent">
            {done}.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => router.push((postId ? `/posts/${postId}` : '/posts') as Route)}
            >
              Open it in the editor
            </button>
          </p>
        ) : null}
      </div>
    </div>
  )
}
