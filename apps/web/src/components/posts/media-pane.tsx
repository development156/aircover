'use client'

import { AlertTriangle, ImageOff } from 'lucide-react'
import type { ChannelSet, PostMedia } from '@sahoda/shared'

import { CardLabel } from '@/components/ui/card'
import type { MediaPreview } from '@/lib/posts/media-url'
import { toAttachment, unverifiableRows, validateAttachments } from '@/lib/posts/to-attachment'

import { ChannelObjections } from './channel-objections'
import { GenerateImage } from './generate-image'
import { InlineNote } from './inline-error'
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
}

const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * 1024

/** Filename from `storage_path`. Never invented — falls back to the raw path. */
function fileNameOf(row: PostMedia): string {
  const segments = row.storage_path.split('/')
  const last = segments[segments.length - 1]
  return last !== undefined && last !== '' ? last : row.storage_path
}

/** Only ever called with a finite, non-negative byte count. */
function formatBytes(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`
  if (bytes >= BYTES_PER_KB) return `${Math.round(bytes / BYTES_PER_KB)} KB`
  return `${bytes} B`
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
}

function MediaRow({ row, unverifiable, previewUrl }: MediaRowProps) {
  const result = toAttachment(row)
  const fileName = fileNameOf(row)

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
        <span className="tabular-nums">
          {row.bytes !== null && Number.isFinite(row.bytes) && row.bytes >= 0
            ? formatBytes(row.bytes)
            : 'Size unknown'}
        </span>
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
 * `post_media.post_id` is NOT NULL and there is no workspace asset library
 * table, so the only affordance is uploading a NEW file — reusing one from
 * another post is not something this schema can express yet, and the note says
 * so rather than offering a picker that cannot work.
 *
 * A row the Constraint Engine cannot judge (null mime/bytes) is flagged as
 * unverified, never as valid: `validateAttachments` returns an empty
 * `violations` list for such rows precisely because it was handed nothing to
 * check.
 */
export function MediaPane({ media, channels, postId, previews = [] }: MediaPaneProps) {
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
          regardless of what trails them — see variant-tabs.tsx. */}
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

      {/* Below the uploader on purpose: bringing your own photo is the ordinary
          path and costs nothing; generating one is the paid alternative. */}
      <GenerateImage postId={postId} />

      <InlineNote>
        There is no workspace media library yet — you can upload a new file here, but not reuse one
        already attached to another post.
      </InlineNote>
    </section>
  )
}
