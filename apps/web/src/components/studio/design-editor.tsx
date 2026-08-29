'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  charBudgetFor,
  composeScene,
  describeComposeFailure,
  presetById,
  renderSvg,
  slotLabelOf,
  templateById,
  imageIdOf,
  type DesignDocument,
  type Palette,
  type StudioDesign,
  type TextBlock,
} from '@sahoda/shared'

import Link from 'next/link'

import { deleteDesign, designPhoto, exportDesign, saveDesign } from '@/app/actions/studio'
import { PhotoPicker } from '@/components/studio/photo-picker'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { PhotoListRead } from '@/lib/studio/read'

/**
 * THE EDITOR. TYPE ON THE LEFT, SEE IT ON THE RIGHT, INSTANTLY.
 *
 * ── THE PREVIEW COSTS NOTHING AND WAITS FOR NOTHING ─────────────────────────
 * `composeScene` and `renderSvg` are pure functions in `@sahoda/shared`. They
 * run here, in the browser, on every keystroke, and produce the SAME string the
 * server will hand to `sharp` at export. There is no round trip and no engine
 * downloaded, which on a mid-range phone over metered data is the difference
 * between an editor and a form that shows you a picture later.
 *
 * ── AND THE PERSON IS STOPPED BEFORE THE OVERFLOW, NOT AFTER ────────────────
 * Each box carries a character budget DERIVED from the layout, so what will not
 * fit cannot be typed. The count is shown while there is little room left rather
 * than always: a counter on every field from the first letter is noise, and
 * people stop reading it before the one time it matters.
 *
 * Line breaks are the person's own. Nothing here wraps, and nothing may ever
 * start: the browser and the server measure text differently, and the moment
 * one of them wraps, this preview stops being the export.
 */
export function DesignEditor({
  design,
  palette,
  photos,
}: {
  design: StudioDesign
  palette: Palette
  photos: PhotoListRead
}) {
  const router = useRouter()
  const [doc, setDoc] = useState<DesignDocument>(design.doc)
  const [title, setTitle] = useState(design.title)
  const [saving, startSave] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [exporting, startExport] = useTransition()
  /**
   * What the last export did, and where the file went. Held apart from `note`
   * because it carries a LINK: "already in your library" with nowhere to go is
   * a sentence about a file the person then has to hunt for.
   */
  const [exported, setExported] = useState<{ message: string; href: string | null } | null>(null)
  /**
   * The BYTES of each chosen picture, keyed by slot, for the preview.
   *
   * Not held in the document and never sent back with it: the document stores
   * an asset ID, and these are fetched from it. Keeping the two apart is what
   * stops a stale base64 blob from being saved into a row and outliving the
   * file it came from.
   */
  const [photoBytes, setPhotoBytes] = useState<Record<string, string>>({})
  const [loadingPhoto, startPhoto] = useTransition()

  const template = templateById(doc.templateId)
  const preset = presetById(design.preset_id)

  const page = doc.pages[0]

  /**
   * Slot to bytes, built fresh from the document every render.
   *
   * Keyed by ASSET ID in state and mapped to slots here, rather than stored per
   * slot: changing the picture in a slot then cannot leave the previous one's
   * bytes behind it, which is a preview showing a photograph the design no
   * longer references.
   */
  const slotImages = useMemo(() => {
    if (page === undefined) return {}
    const map: Record<string, string> = {}
    for (const key of Object.keys(page.slots)) {
      const assetId = imageIdOf(page, key)
      if (assetId === null) continue
      const bytes = photoBytes[assetId]
      if (bytes !== undefined) map[key] = bytes
    }
    return map
  }, [page, photoBytes])

  /**
   * Fetch the bytes of any picture the design references and this editor has
   * not read yet.
   *
   * Bytes rather than the picker's signed URL, because the preview is the SAME
   * string the export rasterises and the renderer refuses anything but a data
   * URI. A picture that cannot be read leaves its slot EMPTY rather than
   * half-drawn, and `composeScene` then refuses the whole design, which is
   * exactly what the export would do.
   */
  useEffect(() => {
    if (page === undefined) return
    const wanted = Object.keys(page.slots)
      .map((key) => imageIdOf(page, key))
      .filter((id): id is string => id !== null && photoBytes[id] === undefined)
    if (wanted.length === 0) return

    let cancelled = false
    void (async () => {
      for (const assetId of wanted) {
        const result = await designPhoto(assetId)
        if (cancelled) return
        if (result.ok) {
          setPhotoBytes((current) => ({ ...current, [assetId]: result.dataUri }))
        } else {
          setNote(result.message)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, photoBytes])

  const svg = useMemo(() => {
    if (template === null || preset === null || page === undefined) return null
    const composed = composeScene(template, page, {
      width: preset.width,
      height: preset.height,
      palette,
      images: slotImages,
    })
    if (!composed.ok) {
      return {
        failure: describeComposeFailure(composed.failure, (key) => slotLabelOf(template, key)),
      }
    }
    return { markup: renderSvg(composed.scene) }
  }, [template, preset, page, palette, slotImages])

  if (template === null || preset === null || page === undefined) {
    return (
      <p role="alert" className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
        This design uses a layout or size Sahoda no longer offers, so it cannot be opened. Nothing
        was deleted.
      </p>
    )
  }

  /** The text blocks, so each box knows the budget its own layout allows. */
  const textBlocks = new Map<string, TextBlock>(
    template.blocks.filter((b): b is TextBlock => b.kind === 'text').map((b) => [b.slot, b]),
  )

  function setSlot(key: string, text: string) {
    setDirty(true)
    setNote(null)
    setDoc((current) => {
      const pages = current.pages.map((p, index) =>
        index === 0 ? { ...p, slots: { ...p.slots, [key]: { kind: 'text' as const, text } } } : p,
      )
      return { ...current, pages }
    })
  }

  /** Point a slot at a picture, and read its bytes so the preview is the export. */
  function chooseImage(key: string, assetId: string) {
    setDirty(true)
    setNote(null)
    setDoc((current) => ({
      ...current,
      pages: current.pages.map((p, index) =>
        index === 0
          ? { ...p, slots: { ...p.slots, [key]: { kind: 'image' as const, assetId } } }
          : p,
      ),
    }))
    if (photoBytes[assetId] !== undefined) return
    startPhoto(async () => {
      const result = await designPhoto(assetId)
      if (result.ok) setPhotoBytes((current) => ({ ...current, [assetId]: result.dataUri }))
      else setNote(result.message)
    })
  }

  /**
   * Take the picture out of a slot.
   *
   * Back to `empty`, which is a slot nobody filled, and NOT to a text slot with
   * an empty string. `document.ts` keeps those apart deliberately, and a
   * template's image block reads the empty one as "no picture here" rather than
   * refusing to draw.
   */
  function clearImage(key: string) {
    setDirty(true)
    setNote(null)
    setDoc((current) => ({
      ...current,
      pages: current.pages.map((p, index) =>
        index === 0 ? { ...p, slots: { ...p.slots, [key]: { kind: 'empty' as const } } } : p,
      ),
    }))
  }

  function save() {
    setNote(null)
    startSave(async () => {
      const result = await saveDesign({
        id: design.id,
        title,
        presetId: design.preset_id,
        doc,
      })
      if (result.ok) {
        setDirty(false)
        setNote('Saved.')
        router.refresh()
        return
      }
      setNote(result.message)
    })
  }

  /**
   * Turn this design into a file in the library.
   *
   * ── SAVE FIRST, ALWAYS ──────────────────────────────────────────────────────
   * The export is drawn on the SERVER from the SAVED row, so exporting with
   * unsaved edits on screen would hand back a picture of the previous version
   * and say nothing about it. Saving first is not a convenience here, it is what
   * makes "this is the picture that exports" true.
   */
  function exportToLibrary() {
    setNote(null)
    setExported(null)
    startExport(async () => {
      if (dirty) {
        const saved = await saveDesign({ id: design.id, title, presetId: design.preset_id, doc })
        if (!saved.ok) {
          setNote(saved.message)
          return
        }
        setDirty(false)
      }

      const result = await exportDesign({ designId: design.id })
      if (!result.ok) {
        setNote(result.message)
        return
      }
      setExported({ message: result.message, href: '/assets' })
      router.refresh()
    })
  }

  function remove() {
    startSave(async () => {
      const result = await deleteDesign(design.id)
      if (result.ok) {
        router.push('/studio')
        return
      }
      setNote(result.message)
    })
  }

  return (
    <div className="grid gap-4 wide:grid-cols-[minmax(0,1fr)_minmax(0,420px)] max-wide:grid-cols-1">
      <section aria-labelledby="editor-fields" className="flex flex-col gap-3">
        <h2 id="editor-fields" className="type-h2">
          What it says
        </h2>

        <label className="flex flex-col gap-1">
          <span className="type-sm text-muted">What you call this design</span>
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value.slice(0, 80))
              setDirty(true)
            }}
            maxLength={80}
            className="surface-ring h-input rounded-sm bg-surface px-3 type-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>

        {template.slots
          .filter((slot) => slot.kind === 'image')
          .map((slot) => (
            <div key={slot.key} className="flex flex-col gap-1">
              <span className="type-sm text-muted">{slot.label}</span>
              <PhotoPicker
                read={photos}
                chosen={imageIdOf(page, slot.key)}
                onChoose={(assetId) => chooseImage(slot.key, assetId)}
                onClear={() => clearImage(slot.key)}
                busy={loadingPhoto || saving || exporting}
              />
            </div>
          ))}

        {template.slots
          .filter((slot) => slot.kind === 'text')
          .map((slot) => {
            const block = textBlocks.get(slot.key)
            const budget =
              block === undefined ? null : charBudgetFor(block, preset.width, preset.height)
            const value =
              page.slots[slot.key]?.kind === 'text'
                ? (page.slots[slot.key] as { text: string }).text
                : ''
            const room = budget === null ? null : budget.total - value.length
            return (
              <label key={slot.key} className="flex flex-col gap-1">
                <span className="type-sm text-muted">{slot.label}</span>
                <Textarea
                  value={value}
                  rows={block?.maxLines ?? 2}
                  maxLength={budget?.total}
                  onChange={(event) => setSlot(slot.key, event.target.value)}
                  data-guide={`studio-slot-${slot.key}`}
                />
                {/* Shown only when it starts to matter. A counter on every field
                    from the first letter is noise people stop reading. */}
                {room !== null && room <= 12 ? (
                  <span className="type-sm num text-muted">
                    {room === 0 ? 'That is the whole line' : `${room} characters left`}
                  </span>
                ) : null}
              </label>
            )
          })}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} loading={saving} disabled={!dirty && note === null}>
            Save design
          </Button>
          <Button
            variant="secondary"
            onClick={exportToLibrary}
            loading={exporting}
            disabled={saving}
            data-guide="studio-export"
          >
            Add to library
          </Button>
          <Button variant="ghost" onClick={remove} disabled={saving || exporting}>
            Delete
          </Button>
          {note === null ? null : (
            <span role="status" className="type-sm text-muted">
              {note}
            </span>
          )}
        </div>

        {exported === null ? null : (
          <p role="status" className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
            {exported.message}{' '}
            {exported.href === null ? null : (
              <Link
                href={exported.href}
                className="underline transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Open your library
              </Link>
            )}
          </p>
        )}

        <p className="type-sm text-muted">
          Adding a design to your library costs nothing. Sahoda draws it, so no credits are spent.
        </p>
      </section>

      <section aria-labelledby="editor-preview" className="flex flex-col gap-3">
        <h2 id="editor-preview" className="type-h2">
          What it looks like
        </h2>
        {svg === null || 'failure' in svg || svg.markup === null ? (
          <div
            className="surface-ring flex items-center justify-center rounded-card bg-s2 p-4"
            style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
          >
            <p className="type-sm text-center text-muted">
              {svg !== null && 'failure' in svg ? svg.failure : 'This design could not be drawn.'}
            </p>
          </div>
        ) : (
          <div
            className="surface-ring overflow-hidden rounded-card [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
            // Built only by `renderSvg`, which escapes every value a person can
            // type and refuses every remote reference. See design-preview.tsx.
            dangerouslySetInnerHTML={{ __html: svg.markup }}
          />
        )}
        <p className="type-sm text-muted">
          {preset.label} &middot; <span className="num">{preset.width}</span> by{' '}
          <span className="num">{preset.height}</span> pixels. This is the picture that exports, not
          a preview of it.
        </p>
      </section>
    </div>
  )
}
