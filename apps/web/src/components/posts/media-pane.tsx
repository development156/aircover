'use client'

import { AlertTriangle, ImageOff } from 'lucide-react'
import type { ChannelSet, PostMedia } from '@sahoda/shared'

import { CardLabel } from '@/components/ui/card'
import { formatBytes } from '@/lib/format-bytes'
import type { MediaPreview } from '@/lib/posts/media-url'
import { toAttachment, unverifiableRows, validateAttachments } from '@/lib/posts/to-attachment'

import { ChannelObjections } from './channel-objections'
import { GenerateImage } from './generate-image'
import { InlineNote } from './inline-error'
import { LibraryPicker } from './library-picker'
import { MediaAttach } from './media-attach'
import { MediaRemoveButton } from './media-remove-button'

export interface MediaPaneProps {
  media: PostMedia[]
  channels: ChannelSet
  postId: string
  /**
   * Signed preview URLs from the server, one per row. Optional because a
   * caller with nothing signed is a legitimate state — every row then renders
   * its honest "preview unavailable" placeholder rather than a broken image.
   */
  previews?: MediaPreview[]
  /**
   * `assets.title` keyed by `storage_path`, for attachments that came from the
   * library. Absent is fine — every row then shows its storage key, which is
   * what this pane showed before a library existed.
   */
  libraryNames?: Record<string, string>
}

/**
 * What to call this file.
 *
 * The library's own name when the row came from there, otherwise the last
 * segment of the storage path. Never invented: a direct upload genuinely has no
 * name beyond its key, and printing a guess would be worse than printing the key.
 */
function fileNameOf(row: PostMedia, libraryNames: ReadonlyMap<string, string>): string {
  const named = libraryNames.get(row.storage_path)
  if (named !== undefined) return named
  const segments = row.storage_path.split('/')
  const last = segments[segments.length - 1]
  return last !== undefined && last !== '' ? last : row.storage_path
}

/**
 * Alt text for the preview. Falls back to naming the file rather than
 * describing it — this component has never seen the image and inventing a
 * description would be worse than admitting there is none.
 */
function altTextFor(row: PostMedia, fileName: string): string {
  const alt = row.alt
  if (alt !== null && alt.trim() !== '') return alt
  return `Attached image with no alt text — ${fileName}`
}

interface MediaRowProps {
  row: PostMedia
  unverifiable: boolean
  /** null means the URL could not be signed. The FILE still exists. */
  previewUrl: string | null
  libraryNames: ReadonlyMap<string, string>
}

function MediaRow({ row, unverifiable, previewUrl, libraryNames }: MediaRowProps) {
  const result = toAttachment(row)
  const fileName = fileNameOf(row, libraryNames)

  return (
    <li className="rounded-input border border-line bg-s1 p-3">
      {previewUrl !== null ? (
        // Signed Supabase URL on a private bucket, short-lived and per-request:
        // next/image would need it in remotePatterns and would cache a link
        // that expires within the hour.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={altTextFor(row, fileName)}
          loading="lazy"
          className="mb-2 max-w-full rounded-input border border-line bg-bg object-contain"
        />
      ) : (
        /* The row is NEVER hidden for want of a preview. The file is on the
           post, it counts against every channel's media cap, and it is the
           writer's only handle for removing it. */
        <p className="mb-2 flex items-center gap-2 rounded-input border border-dashed border-line bg-bg px-3 py-4 text-[12.5px] text-muted">
          <ImageOff size={15} strokeWidth={1.7} className="shrink-0 text-faint" aria-hidden />
          <span>Preview unavailable — the file is still attached to this post.</span>
        </p>
      )}

      <p className="truncate text-[13px] font-semibold text-ink">{fileName}</p>
      <p className="mt-0.5 truncate text-[12.5px] text-muted">
        {row.alt !== null && row.alt !== '' ? row.alt : 'No alt text on this file'}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        <span>{row.mime ?? 'Type unknown'}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{formatBytes(row.bytes) ?? 'Size unknown'}</span>
        {row.width !== null && row.height !== null ? (
          <>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {row.width}×{row.height}
            </span>
          </>
        ) : null}
      </p>
      {unverifiable ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-input bg-warn-bg px-2 py-1.5 text-[12.5px] text-warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {"Can't verify this file — "}
            {!result.ok ? result.message : 'it could not be checked against the channel limits.'}
          </span>
        </p>
      ) : null}

      <MediaRemoveButton mediaId={row.id} fileName={fileName} />
    </li>
  )
}

/**
 * Media attached to THIS post.
 *
 * Two ways in, and they are genuinely different jobs: upload a file that is not
 * in Sahoda yet, or reach for one that is. The library picker is second because
 * a writer with a photo on their phone is the ordinary case; it is not hidden
 * behind the uploader because a writer who has built a library should not have
 * to re-upload the same logo onto every post.
 *
 * A file added from the library POINTS AT the library's stored object rather
 * than copying it. That is what makes one upload serve five posts — and it is
 * why `detachMedia` checks `asset_id` before removing an object.
 *
 * A row the Constraint Engine cannot judge (null mime/bytes) is flagged as
 * unverified, never as valid: `validateAttachments` returns an empty
 * `violations` list for such rows precisely because it was handed nothing to
 * check.
 */
export function MediaPane({
  media,
  channels,
  postId,
  previews = [],
  libraryNames = {},
}: MediaPaneProps) {
  const names: ReadonlyMap<string, string> = new Map(Object.entries(libraryNames))
  const unverifiableIds = new Set(unverifiableRows(media).map((row) => row.id))
  const verdicts = channels.length > 0 ? validateAttachments(channels, media) : []
  const flagged = verdicts.filter((verdict) => verdict.violations.length > 0)
  // Keyed by row id, not position: the two lists are signed together but a
  // caller could pass a stale or partial set, and a positional read would then
  // hang one row's preview on another row.
  const previewById = new Map(previews.map((preview) => [preview.id, preview.url]))

  return (
    <section className="space-y-3" data-guide="post-media">
      {/* min-h-5 pins the header row so all three column labels share a baseline
          regardless of what trails them. */}
      <div className="flex min-h-5 items-center justify-between gap-2">
        <CardLabel className="mb-0">Media</CardLabel>
        <span className="tabular-nums text-[12px] text-muted">{media.length}</span>
      </div>

      {media.length === 0 ? (
        <div className="rounded-card border border-line bg-bg p-4 text-center">
          <span className="mx-auto mb-2 grid size-9 place-items-center rounded-pill bg-tint-50 text-accent dark:bg-s2">
            <ImageOff size={17} strokeWidth={1.7} aria-hidden />
          </span>
          <p className="text-[13px] font-semibold text-ink">No media on this post</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Channel limits still apply to text-only posts.
          </p>
          <p className="mt-2 text-[12px] text-muted">
            Sahoda checks every file against each channel before you publish.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {media.map((row) => (
            <MediaRow
              key={row.id}
              row={row}
              unverifiable={unverifiableIds.has(row.id)}
              previewUrl={previewById.get(row.id) ?? null}
              libraryNames={names}
            />
          ))}
        </ul>
      )}

      {flagged.length > 0 ? (
        <div role="alert">
          <ChannelObjections objections={flagged} tone="danger" />
        </div>
      ) : null}

      <MediaAttach postId={postId} channels={channels} />

      <LibraryPicker postId={postId} channels={channels} />

      {/* Below both on purpose: bringing your own photo is the ordinary path and
          costs nothing; generating one is the paid alternative. */}
      <GenerateImage postId={postId} />

      <InlineNote>
        A photo added from your library stays in it. Removing it here takes it off this post only.
      </InlineNote>
    </section>
  )
}
