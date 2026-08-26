import { FolderOpen } from 'lucide-react'

import { AssetLibrary } from '@/components/assets/asset-library'
import { AssetUpload } from '@/components/assets/asset-upload'
import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { readFolderTree } from '@/lib/assets/folders-read'
import { readAssets } from '@/lib/assets/read'
import type { AssetCard } from '@/lib/assets/view'
import { signMediaPreviews } from '@/lib/posts/media-url'

export const metadata = { title: 'Assets' }

/**
 * The media library — one place for every photo, reusable across posts.
 *
 * ── WHAT CHANGED HERE ────────────────────────────────────────────────────────
 * This screen used to be a picture of a library: six named tiles, a search field
 * with nothing behind it, and chips with no counts, all rendered inert because
 * the tables did not exist. They exist now, so the screen is the thing rather
 * than a drawing of it, and every figure on it comes from a row.
 *
 * ── THREE READS, THREE DIFFERENT SENTENCES ───────────────────────────────────
 * An empty list is NOT the same as no workspace and NOT the same as a read that
 * failed. Flattening the three is how a library holding forty photos tells its
 * owner it is empty and offers to help them start — the exact failure
 * `lib/posts/read.ts` documents at length for `/posts`.
 */
export default async function AssetsPage() {
  // ── ONE ROUND TRIP, NOT TWO ─────────────────────────────────────────────────
  // The folder tree does not depend on the file list and the file list does not
  // depend on the folder tree, so making the second wait for the first buys
  // nothing and costs a round trip on every visit to this screen.
  //
  // MEASURED: added sequentially, this took `/assets` from 8 to 9 sequential
  // server reads and `lib/perf/read-waterfall.test.ts` named the new one. In
  // parallel it is 7, which is one fewer than before the folder system existed.
  const [read, tree] = await Promise.all([readAssets(), readFolderTree()])

  if (read.status === 'no-workspace') {
    return (
      <Shell>
        <EmptyState
          icon={FolderOpen}
          title="No workspace yet"
          body="Your library belongs to a workspace. Finish setting one up and your photos live here."
        />
      </Shell>
    )
  }

  if (read.status === 'unreadable') {
    return (
      <Shell>
        <EmptyState
          icon={FolderOpen}
          title="Sahoda could not read your library"
          body="This is not a claim that it is empty. The list did not come back. Reload the page."
        />
      </Shell>
    )
  }

  // Sequential on the rows: the bucket is private, so only the server can mint
  // these, and `signMediaPreviews` degrades to `url: null` per row rather than
  // throwing — a signing hiccup costs previews, never the page.
  const previews = await signMediaPreviews(read.assets.map((entry) => entry.asset))
  const urlById = new Map(previews.map((preview) => [preview.id, preview.url]))

  // ── THE FOLDER READ FAILS SEPARATELY, AND IS NOT ALLOWED TO TAKE THE FILES ──
  // A person whose folders did not load still has a library, and the files are
  // already in hand. So a failed folder read costs the FOLDERS and says so; it
  // does not turn a working screen into an error page.
  //
  // What it must never do is degrade to an empty list. "You have no folders" and
  // "we could not read your folders" are different sentences about the customer's
  // own work, and only one of them is true here — which is why `foldersUnreadable`
  // is passed rather than an empty array standing in for both.
  const foldersReadable = tree.status === 'ok'

  const cards: AssetCard[] = read.assets.map(({ asset, usage }) => ({
    id: asset.id,
    title: asset.title,
    alt: asset.alt,
    kind: asset.kind,
    mime: asset.mime,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    createdAt: asset.created_at,
    // Keyed by id, never by position: the two lists are built together, but a
    // positional read would hang one photo's preview on another the day a row
    // fails to parse.
    previewUrl: urlById.get(asset.id) ?? null,
    usage,
    // `null`, not `[]`, when the memberships did not come back. An empty array
    // would state that every photo is filed nowhere, and the unfiled count on
    // the screen is built from exactly that distinction.
    folderIds: foldersReadable ? (tree.itemsByAsset.get(asset.id) ?? []) : null,
  }))

  return (
    <Shell action>
      <AssetLibrary
        cards={cards}
        capped={read.capped}
        folders={foldersReadable ? tree.folders : []}
        smart={foldersReadable ? tree.smart : []}
        droppedFolders={foldersReadable ? tree.droppedFolders : 0}
        droppedSmart={foldersReadable ? tree.droppedSmart : 0}
        foldersUnreadable={!foldersReadable}
      />
    </Shell>
  )
}

/**
 * The page frame.
 *
 * The uploader is the ONE primary action on this screen (docs/26 §1.5) and it is
 * rendered HERE, once, in every state that has a workspace — including the empty
 * one. It used to live inside the empty state as well, and that cost the first
 * upload its own confirmation: the library stopped being empty, the empty state
 * unmounted, and the "Added 1 photo." message unmounted with it. A control that
 * reports an outcome has to outlive the state change it causes.
 */
function Shell({ children, action = false }: { children: React.ReactNode; action?: boolean }) {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle>Assets</PageTitle>
          <p className="mt-1 text-[13px] text-muted">
            Every photo you have added, and which posts are using it.
          </p>
        </div>
        {action ? (
          <div className="max-narrow:w-full">
            <AssetUpload />
          </div>
        ) : null}
      </div>

      {children}
    </div>
  )
}
