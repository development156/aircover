'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { ArrowLeft } from 'lucide-react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { ChannelPicker } from '@/components/posts/channel-picker'
import { NEW_POST_STASH_KEY } from '@/components/posts/use-autosave'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ComposerHeaderProps {
  title: string
  onTitleChange: (title: string) => void
  channels: ChannelSet
  onChannelsChange: (channels: ChannelSet) => void
  connected?: ReadonlySet<Channel>
  /**
   * Posts whose crash buffer is still in this tab, found by `stashedPostIds`.
   * Only a NEW post's screen passes any: on an existing post the buffer for
   * that post is restored by `useAutosave` and there is nothing to offer.
   */
  lostDrafts?: readonly string[]
}

/** `draft-recovery.ts` keys its buffer as `sahoda.draft.<post id>`. */
const STASH_PREFIX = 'sahoda.draft.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * F-14 · Post ids that still hold a crash buffer in this tab.
 *
 * `/posts/new` only ever consulted the buffer under `new`. A writer whose tab
 * died mid-sentence on `/posts/<id>` and who came back through "Create post"
 * found an empty editor while their words sat in `sessionStorage` under an id
 * nobody was reading. The `new` key is this screen's own buffer and is already
 * restored; only a real id names a post that exists somewhere else. Every
 * storage call is guarded, for the reason `draft-recovery.ts` gives.
 */
export function stashedPostIds(): string[] {
  try {
    const ids: string[] = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key === null || !key.startsWith(STASH_PREFIX)) continue
      const id = key.slice(STASH_PREFIX.length)
      if (id === NEW_POST_STASH_KEY || !UUID.test(id)) continue
      ids.push(id)
    }
    return ids
  } catch {
    return []
  }
}

/**
 * Offered as a LINK, never restored into this editor: the words belong to that
 * post's row, and restoring them here would make a second copy of one draft.
 */
function LostDraftNote({ postIds }: { postIds: readonly string[] }) {
  return (
    <div
      role="status"
      className="surface-ring flex flex-wrap items-center justify-between gap-2 rounded-card bg-s2 px-3 py-2.5"
    >
      <p className="type-sm text-ink">
        {postIds.length === 1
          ? 'A post you were writing was not finished. Its words are still here.'
          : `${postIds.length} posts you were writing were not finished. Their words are still here.`}
      </p>
      <span className="flex flex-wrap gap-2">
        {postIds.slice(0, 3).map((id, index) => (
          <Link
            key={id}
            href={`/posts/${id}` as Route}
            className="type-sm font-[550] text-accent underline underline-offset-2"
          >
            {postIds.length === 1
              ? 'Continue your saved draft'
              : `Continue your saved draft ${index + 1}`}
          </Link>
        ))}
      </span>
    </div>
  )
}

/**
 * The two decisions that apply to the whole post: what to call it, and where it
 * is going.
 *
 * ── THE CHANNEL ROW IS AT THE TOP AND IT IS NEVER A STEP ─────────────────────
 * The deleted wizard made channels step 1 of 5, which meant changing your mind
 * halfway through writing was a navigation. Here it is a row of toggles that sits
 * above the work the whole time: picking one opens its version, dropping one
 * closes it, and neither loses a word of anything else.
 *
 * The title is a plain `Input` rather than a borderless display-weight field.
 * docs/26 §5 forbids hand-writing a font shorthand and §10 lists the primitives
 * that exist; a document-title input is not one of them, and inventing it at a
 * call site is exactly how the type scale drifted in the first place.
 *
 * ── THE WAY BACK ─────────────────────────────────────────────────────────────
 * `docs/34` §10 named this screen the worst in the product and listed "no page
 * title, no back link" among the reasons. Only half of that is a defect: the
 * page's heading IS the title input, deliberately, and a visible "Write a post"
 * above a field labelled "Name this post" would be the second `type-h1` §16
 * forbids saying the same thing twice.
 *
 * The BACK LINK is a real gap and it is a momentum one. A person arrives here
 * by clicking a row on /posts, and the only route back was the rail — which on
 * a phone is behind "More", and which loses the list position either way. Same
 * treatment `radar/[id]` and the inbox threads use, so the product has one way
 * of returning from a detail screen rather than three.
 */
export function ComposerHeader({
  title,
  onTitleChange,
  channels,
  onChannelsChange,
  connected,
  lostDrafts = [],
}: ComposerHeaderProps) {
  return (
    <div className="space-y-4">
      {lostDrafts.length > 0 ? <LostDraftNote postIds={lostDrafts} /> : null}

      <Link
        href="/posts"
        className="type-sm inline-flex items-center gap-1.5 text-muted transition-micro hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        All posts
      </Link>

      <div className="space-y-1.5">
        <Label htmlFor="post-title">Name this post</Label>
        <Input
          id="post-title"
          value={title}
          placeholder="Only you see this"
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </div>

      <ChannelPicker
        selected={channels}
        onChange={onChannelsChange}
        connected={connected}
        hideLabel={false}
      />
    </div>
  )
}
