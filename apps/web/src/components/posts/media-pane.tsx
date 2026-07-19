'use client'

import { AlertTriangle, ImageOff, Paperclip } from 'lucide-react'
import type { Channel, PostMedia } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { CardLabel } from '@/components/ui/card'
import { describeViolation } from '@/lib/posts/violation-copy'
import { toAttachment, unverifiableRows, validateAttachments } from '@/lib/posts/to-attachment'

import { CHANNEL_LABELS } from './channel-label'
import { InlineNote } from './inline-error'

export interface MediaPaneProps {
  media: PostMedia[]
  channels: Channel[]
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

function MediaRow({ row, unverifiable }: { row: PostMedia; unverifiable: boolean }) {
  const result = toAttachment(row)
  return (
    <li className="rounded-input border border-line bg-s1 p-3">
      <p className="truncate text-[13px] font-semibold text-ink">{fileNameOf(row)}</p>
      <p className="mt-0.5 truncate text-[12.5px] text-muted">
        {row.alt !== null && row.alt !== '' ? row.alt : 'No alt text on this file'}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-faint">
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
    </li>
  )
}

/**
 * Media attached to THIS post. There is no workspace media library table and
 * `post_media.post_id` is NOT NULL, so no picker is offered — the add
 * affordance is rendered disabled and labelled as pending rather than faked.
 *
 * A row the Constraint Engine cannot judge (null mime/bytes) is flagged as
 * unverified, never as valid: `validateAttachments` returns an empty
 * `violations` list for such rows precisely because it was handed nothing to
 * check.
 */
export function MediaPane({ media, channels }: MediaPaneProps) {
  const unverifiableIds = new Set(unverifiableRows(media).map((row) => row.id))
  const verdicts = channels.length > 0 ? validateAttachments(channels, media) : []
  const flagged = verdicts.filter((verdict) => verdict.violations.length > 0)

  return (
    <section className="space-y-3" data-guide="post-media">
      <div className="flex items-center justify-between gap-2">
        <CardLabel className="mb-0">Media</CardLabel>
        <span className="tabular-nums text-[12px] text-faint">{media.length}</span>
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
          <p className="mt-2 text-[12px] text-faint">
            Sahoda: I check every file against each channel before you publish.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {media.map((row) => (
            <MediaRow key={row.id} row={row} unverifiable={unverifiableIds.has(row.id)} />
          ))}
        </ul>
      )}

      {flagged.length > 0 ? (
        <div className="space-y-2">
          {flagged.map((verdict) => (
            <div
              key={verdict.channel}
              role="alert"
              className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
            >
              <p className="font-semibold">{CHANNEL_LABELS[verdict.channel]}</p>
              <ul className="mt-1 space-y-0.5">
                {verdict.violations.map((violation) => (
                  <li key={`${violation.code}-${violation.message}`}>
                    {describeViolation(violation).message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-line pt-3">
        <Button variant="secondary" size="sm" disabled className="w-full">
          <Paperclip size={13} aria-hidden />
          Add media
        </Button>
        <InlineNote>
          Uploading from the editor is not built yet — this button does nothing today.
        </InlineNote>
      </div>
    </section>
  )
}
