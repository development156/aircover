'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FolderOpen, Search } from 'lucide-react'
import type { ChannelSet } from '@sahoda/shared'

import { attachAssetToPost } from '@/app/actions/assets'
import { listAssetsForPicker } from '@/app/actions/assets-picker'
import { acceptCropForAsset } from '@/app/actions/posts-crop'
import { CropOfferDialog } from '@/components/media/crop-offer-dialog'
import type { AcceptCropState } from '@/lib/media/crop-state'
import type { FocalPoint } from '@/lib/media/crop-geometry'
import { NO_OFFER_COPY } from '@/lib/media/offer-state'
import type { AttachAssetState } from '@/lib/assets/state'
import type { AssetCard } from '@/lib/assets/view'
import { displayName } from '@/lib/assets/view'
import { AssetThumb } from '@/components/assets/asset-thumb'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

import { ChannelObjections } from './channel-objections'

/**
 * Put a photo already in the library onto this post.
 *
 * ── A MODAL, NOT A DRAWER ────────────────────────────────────────────────────
 * The writer opened this to answer one question — which photo — and cannot get
 * on with the post until they have. That is the definition of a modal in this
 * system (docs/26 §10.1).
 *
 * ── THE LIST IS FETCHED WHEN IT IS OPENED, NOT WITH THE PAGE ─────────────────
 * The composer already does five reads before it paints. Loading the whole
 * library alongside them would slow down every post that never opens this, and
 * signed preview URLs live an hour — minting two hundred of them for a writer
 * who does not want a photo is work nobody asked for.
 *
 * ── THE CHANNEL RULES ARE APPLIED BY THE SERVER, AND REPORTED HERE ───────────
 * A photo that is fine in the library can be wrong for THIS post: its channel
 * set is different and its media count is not zero. `attachAssetToPost` runs the
 * same `decideAttach` the direct upload runs, and its objections are shown per
 * channel rather than collapsed into "that did not work".
 */
export function LibraryPicker({ postId, channels }: { postId: string; channels: ChannelSet }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<AssetCard[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<AttachAssetState | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // The photo a refusal was about, so accepting a crop knows which file to cut.
  const [offerFor, setOfferFor] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [cropError, setCropError] = useState<string | null>(null)
  const [cropped, setCropped] = useState<AcceptCropState | null>(null)

  useEffect(() => {
    if (!open || cards !== null) return
    let live = true
    void listAssetsForPicker().then((read) => {
      if (!live) return
      if (read.ok) setCards(read.cards)
      else setLoadFailed(true)
    })
    return () => {
      live = false
    }
  }, [open, cards])

  const needle = query.trim().toLowerCase()
  const visible = (cards ?? []).filter((card) =>
    needle === '' ? true : `${card.title ?? ''} ${card.alt ?? ''}`.toLowerCase().includes(needle),
  )

  function attach(card: AssetCard) {
    setResult(null)
    setCropped(null)
    setCropError(null)
    setBusyId(card.id)
    startTransition(async () => {
      const state = await attachAssetToPost(postId, card.id)
      setResult(state)
      setBusyId(null)
      if (state.ok) {
        router.refresh()
        setOpen(false)
        return
      }
      // The refusal renders below either way. The picker closes so the crop
      // dialog is not a modal stacked on a modal — two <dialog>s in the top
      // layer trap focus in the wrong one.
      if (state.offer !== undefined) {
        setOfferFor(card.id)
        setOpen(false)
        setCropOpen(true)
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => setOpen(true)}
        data-guide="post-media.library"
      >
        <FolderOpen size={14} strokeWidth={1.8} aria-hidden />
        Choose from library
      </Button>

      {/* Outside the modal: a modal unmounts on success, and an outcome that
          unmounts with it is an outcome nobody read. */}
      {result !== null && !result.ok ? (
        <div role="alert" className="mt-2 space-y-2">
          <p className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger">
            {result.message}
          </p>
          <ChannelObjections objections={result.rejections ?? []} tone="danger" />
          {result.noOffer !== undefined && (NO_OFFER_COPY[result.noOffer] ?? '') !== '' ? (
            <p className="rounded-input bg-s1 px-3 py-2.5 type-body text-muted">
              {NO_OFFER_COPY[result.noOffer]}
            </p>
          ) : null}
          {result.offer !== undefined ? (
            <Button type="button" variant="secondary" onClick={() => setCropOpen(true)}>
              Show the crop Sahoda would make
            </Button>
          ) : null}
        </div>
      ) : null}

      {cropped !== null && cropped.ok ? (
        <div className="mt-2 space-y-2">
          <p className="rounded-input bg-ok-bg px-3 py-2.5 type-body text-ok">
            {cropped.message}
          </p>
          {cropped.warnings.length > 0 ? (
            <>
              <p className="rounded-input border border-warn bg-warn-bg px-3 py-2.5 type-body text-warn">
                These channels still will not use it:
              </p>
              <ChannelObjections objections={cropped.warnings} tone="warn" />
            </>
          ) : null}
        </div>
      ) : null}

      {result !== null && !result.ok && result.offer !== undefined ? (
        <CropOfferDialog
          offer={result.offer}
          open={cropOpen}
          onClose={() => setCropOpen(false)}
          pending={pending}
          // The library file's own signed URL is on the offer; the browser holds
          // no copy of a photo it did not pick this session.
          localSrc={null}
          error={cropError}
          onAccept={(focal: FocalPoint) => {
            if (offerFor === null) return
            setCropError(null)
            startTransition(async () => {
              const state = await acceptCropForAsset(postId, offerFor, focal.x, focal.y)
              if (!state.ok) {
                setCropError(state.message)
                return
              }
              setCropOpen(false)
              setResult(null)
              setCropped(state)
              router.refresh()
            })
          }}
        />
      ) : null}
      {result !== null && result.ok && result.warnings.length > 0 ? (
        <div className="mt-2 space-y-2">
          <p className="rounded-input border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
            Added this photo. It is on the post — these channels will not use it:
          </p>
          <ChannelObjections objections={result.warnings} tone="warn" />
        </div>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose a photo"
        description={
          channels.length > 0
            ? 'Sahoda checks it against every channel on this post before adding it.'
            : 'Pick channels on this post to have Sahoda check the photo against their limits.'
        }
        className="text-left"
      >
        <div className="space-y-3 text-left">
          <label className="relative flex items-center">
            <span className="sr-only">Search your library</span>
            <Search
              size={15}
              strokeWidth={1.8}
              aria-hidden
              className="pointer-events-none absolute left-3 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or description"
              className="h-input w-full rounded-input border border-line bg-surface pr-3 pl-9 text-[13px] text-ink placeholder:text-muted max-narrow:min-h-[44px]"
            />
          </label>

          {loadFailed ? (
            <p role="alert" className="rounded-input bg-s1 px-3 py-4 text-[13px] text-muted">
              Sahoda could not read your library. This is not a claim that it is empty — close this
              and open it again.
            </p>
          ) : cards === null ? (
            <p className="rounded-input bg-s1 px-3 py-4 text-[13px] text-muted">
              Loading your library…
            </p>
          ) : cards.length === 0 ? (
            <p className="rounded-input bg-s1 px-3 py-4 text-[13px] text-muted">
              Your library is empty. Add a photo below and it will be here next time.
            </p>
          ) : visible.length === 0 ? (
            <p className="rounded-input bg-s1 px-3 py-4 text-[13px] text-muted">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            <ul className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto narrow:grid-cols-3">
              {visible.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => attach(card)}
                    disabled={pending}
                    className="surface-ring flex w-full flex-col overflow-hidden rounded-card bg-surface text-left transition-micro hover:bg-s1 disabled:opacity-45"
                  >
                    <AssetThumb card={card} className="aspect-[4/3] w-full" />
                    <span className="min-w-0 px-2 py-1.5">
                      <span className="block truncate text-[12px] font-[550] text-ink">
                        {displayName(card)}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {busyId === card.id ? 'Adding…' : 'Add to this post'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </>
  )
}
