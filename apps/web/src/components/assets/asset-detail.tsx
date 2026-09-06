'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { updateAsset } from '@/app/actions/assets'
import { formatBytes } from '@/lib/format-bytes'
import type { AssetCard } from '@/lib/assets/view'
import { displayName } from '@/lib/assets/view'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Unmeasured } from '@/components/design-system/absence-row'

import { AssetThumb } from './asset-thumb'
import { UsageList } from './usage-list'

/**
 * Everything about one library file, in the drawer.
 *
 * ── WHAT IT WILL NOT SAY ─────────────────────────────────────────────────────
 * A size, a type or a pixel count that is not on the row. All four columns are
 * nullable and none carries a CHECK, so "unknown" is a state a real row reaches.
 * It is rendered with the absence vocabulary (docs/26 §4) — a solid rule meaning
 * "not measured" with an accessible name — rather than an em dash, which was the
 * most-rendered glyph in this product and meant three different things.
 *
 * ── THE ALT FIELD IS NOT DECORATION ──────────────────────────────────────────
 * `assets.alt` rides on the FILE, so describing a photo once describes it
 * everywhere it is used. `attachAssetToPost` copies it onto the attachment, which
 * is why the field is here and not repeated per post.
 *
 * ── THE DRAWER MOVES TO THE TRASH; IT DOES NOT DELETE ────────────────────────
 * This rendered `AssetDeleteButton`, the permanent delete. MEASURED 2026-09-06:
 * "Delete file" on an unused LIVE file removed it for good in one press, with
 * no confirmation and no trash entry, while the file menu two inches away
 * offered "Move to trash" with Undo. Same file, two doors, one of them a hole.
 * The drawer now takes the same path the menu takes (`trashSingle`, which
 * reports in the banner and carries the Undo), and `deleteAsset` itself now
 * refuses a live row, so no third door can open this way again.
 */
export function AssetDetail({ card, onTrash }: { card: AssetCard; onTrash: () => void }) {
  const name = displayName(card)
  const size = formatBytes(card.bytes)

  return (
    <div className="space-y-5 text-left">
      <AssetThumb card={card} className="max-h-[280px] w-full rounded-card object-contain" />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
        <Fact label="Type" value={card.mime} />
        <Fact label="Size" value={size} />
        <Fact
          label="Dimensions"
          value={
            card.width !== null && card.height !== null ? `${card.width}×${card.height}` : null
          }
          numeric
        />
        <Fact label="Added" value={new Date(card.createdAt).toLocaleDateString()} />
      </dl>

      <AssetNameAndAlt card={card} />

      <section className="space-y-2">
        <h3 className="type-eyebrow text-muted">Used in</h3>
        <UsageList sites={card.usage} />
      </section>

      {/* Last, and given no standing space anywhere else: a destructive action
          never sits in a list row (docs/26 §1.5). */}
      <section className="space-y-2 border-t border-line-soft pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onTrash}
          aria-label={`Move ${name} to the trash`}
          data-guide="assets.trash"
        >
          <Trash2 size={14} strokeWidth={1.8} aria-hidden />
          Move to trash
        </Button>
        <p className="text-[12px] text-muted">
          It stays on its posts and in its folders, and Restore in the trash puts it back. Deleting
          for good happens from the trash.
        </p>
      </section>
    </div>
  )
}

function Fact({
  label,
  value,
  numeric = false,
}: {
  label: string
  value: string | null
  numeric?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="type-eyebrow text-muted">{label}</dt>
      <dd className={`mt-0.5 truncate text-ink ${numeric ? 'num' : ''}`}>
        {/* Not an em dash. A solid rule with an accessible name says "the slot
            is real, the reading never arrived" — which is exactly true of a
            nullable column on a row nothing measured. */}
        {value === null || value === '' ? <Unmeasured what={label} /> : value}
      </dd>
    </div>
  )
}

/**
 * The two fields a person may edit.
 *
 * Saved together on one press rather than on blur: an autosave that fires while
 * someone is still typing a description writes half a sentence, and there is no
 * undo for the half it kept.
 */
function AssetNameAndAlt({ card }: { card: AssetCard }) {
  const router = useRouter()
  const [title, setTitle] = useState(card.title ?? '')
  const [alt, setAlt] = useState(card.alt ?? '')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // A different file in the same drawer is a different subject. Without this the
  // fields would keep the previous photo's text and a save would write it onto
  // this one.
  useEffect(() => {
    setTitle(card.title ?? '')
    setAlt(card.alt ?? '')
    setMessage(null)
  }, [card.id, card.title, card.alt])

  const dirty = title !== (card.title ?? '') || alt !== (card.alt ?? '')

  function save() {
    setMessage(null)
    startTransition(async () => {
      const result = await updateAsset(card.id, { title, alt })
      if (result.ok) {
        setMessage({ ok: true, text: 'Saved.' })
        router.refresh()
        return
      }
      setMessage({ ok: false, text: result.message })
    })
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`asset-title-${card.id}`}>Name</Label>
        <Input
          id={`asset-title-${card.id}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What you call this photo"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`asset-alt-${card.id}`}>Description for screen readers</Label>
        <Input
          id={`asset-alt-${card.id}`}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          placeholder="Describe what is in the photo"
          aria-describedby={`asset-alt-help-${card.id}`}
        />
        <p id={`asset-alt-help-${card.id}`} className="text-[12px] text-muted">
          Written once here, and carried onto every post that uses this photo.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={pending}
          disabled={!dirty}
          onClick={save}
        >
          {pending ? 'Saving…' : 'Save details'}
        </Button>
        {message !== null ? (
          <span role="status" className={`text-[12.5px] ${message.ok ? 'text-ok' : 'text-danger'}`}>
            {message.text}
          </span>
        ) : null}
      </div>
    </section>
  )
}
