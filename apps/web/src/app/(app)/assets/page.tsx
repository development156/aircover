import { Image as ImageIcon, LayoutGrid, Search, Sparkles, Upload } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { InertButton, InertChip, InertField, RoadmapBanner } from '@/components/roadmap/inert'

export const metadata = { title: 'Assets' }

/**
 * The creative library, as the reference designs it.
 *
 * ── WHY IT IS NOT WIRED TO post_media ────────────────────────────────────────
 * Media exists in this product, but only ever ATTACHED TO A POST — `post_media`
 * has a post_id and no standalone library, no folders, no tags, no "used in"
 * back-reference and no variations. Listing post attachments here would present
 * a library that cannot be added to, searched by kind, or reused, which is a
 * different product from the one the screen promises.
 *
 * SCHEMA-REQUIRED, and logged rather than worked around: a workspace-scoped
 * `assets` table (workspace_id, storage path, mime, bytes, kind, alt, created_by)
 * plus a join for "used in". Migrations apply to production, so this run does
 * not write one.
 *
 * ── WHAT IS WITHHELD ─────────────────────────────────────────────────────────
 * The reference's chips carry kind counts and its detail pane reports "used in N
 * campaigns" and a file size. None of those can be counted here, so the chips
 * keep their names and the tiles show a kind label and nothing else.
 */

const KINDS = ['All', 'Images', 'Videos', 'Documents', 'Logos', 'AI generated'] as const

/** Six tiles, because the reference's grid is three across, two deep. */
const TILES = [
  'A photo you uploaded',
  'A logo for your brand',
  'An image Sahoda made',
  'A menu or price list',
  'A short video',
  'A variation of one of these',
] as const

export default function AssetsPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle>Assets</PageTitle>
          <p className="mt-1 text-[13px] text-muted">
            The images, logos and clips Sahoda reuses when it writes for you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InertButton>
            <Sparkles size={14} strokeWidth={1.8} aria-hidden />
            Create variation
          </InertButton>
          <InertButton>
            <Upload size={14} strokeWidth={1.8} aria-hidden />
            Upload
          </InertButton>
          <InertButton primary>Generate</InertButton>
        </div>
      </div>

      <RoadmapBanner what="One library for every image, clip and document, reusable across posts and campaigns." />

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-[220px] flex-1 items-center gap-2 max-narrow:min-w-0">
          <Search size={15} strokeWidth={1.8} className="shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1">
            <InertField label="Search assets…" />
          </span>
        </span>
        <span data-inert-control aria-hidden className="text-muted">
          <LayoutGrid size={16} strokeWidth={1.8} />
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k, i) => (
          <InertChip key={k} on={i === 0}>
            {k}
          </InertChip>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {TILES.map((name) => (
          <figure key={name} className="is-proposed flex flex-col rounded-card">
            {/* 4:3, the reference's own aspect for an asset tile. */}
            <div className="grid aspect-[4/3] place-items-center rounded-t-card bg-s2 text-muted">
              <ImageIcon size={22} strokeWidth={1.5} aria-hidden />
            </div>
            <figcaption className="flex items-baseline justify-between gap-2 px-3 py-2.5">
              <span className="min-w-0 truncate text-[12.5px] font-[550] text-muted">{name}</span>
              {/* The reference prints a file size here. Nothing to size. */}
              <span className="shrink-0 text-[11px] text-muted">&mdash;</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
