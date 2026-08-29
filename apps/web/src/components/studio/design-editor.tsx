'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  MAX_CAROUSEL_PAGES,
  addPage,
  charBudgetFor,
  composeScene,
  describeComposeFailure,
  presetById,
  renderSvg,
  slotLabelOf,
  templateById,
  imageIdOf,
  movePage,
  removePage,
  slotKeysOf,
  type DesignDocument,
  type Palette,
  type StudioDesign,
  type TextBlock,
} from '@sahoda/shared'

import Link from 'next/link'

import {
  deleteDesign,
  designPhoto,
  exportDesign,
  exportDesignPages,
  saveDesign,
  setDesignTemplate,
} from '@/app/actions/studio'
import { PhotoPicker } from '@/components/studio/photo-picker'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { type DesignDraft, describeSaveState } from '@/lib/studio/autosave'
import { DELETE_AT_REST, DELETE_CANCEL, describeDesignDelete } from '@/lib/studio/delete-copy'
import { useDesignAutosave } from '@/lib/studio/use-design-autosave'
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
  const [exporting, startExport] = useTransition()
  /**
   * What the last export did. Held apart from `note` because it carries a LINK:
   * "already in your library" with nowhere to go is a sentence about a file the
   * person then has to hunt for.
   *
   * The destination is the literal `/assets` rather than a string in state, and
   * that is not tidiness: `next.config.ts` turns on typed routes, so a `string`
   * href fails the BUILD while `turbo typecheck` stays green. The trash lives on
   * that same screen, so one link serves all three outcomes.
   */
  const [exported, setExported] = useState<string | null>(null)
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
  /**
   * Which slide is being edited. Held here rather than in the document: it is
   * where this person is looking, not something about the design, and saving it
   * would make two people editing the same carousel fight over the view.
   */
  const [pageAt, setPageAt] = useState(0)
  /**
   * Whether this design is one of the workspace's starting points.
   *
   * Seeded from the row and then held from what each write READ BACK, never
   * from what the press asked for: a toggle that flips optimistically is a
   * toggle that lies the first time the write is refused.
   */
  const [isTemplate, setIsTemplate] = useState(design.is_template)

  /**
   * The design as it stands, and the autosave that keeps it.
   *
   * `isTemplate` is IN the draft, and that is a fix rather than tidiness:
   * `saveDesign` writes `is_template: isTemplate ?? false`, so every save that
   * omitted the field quietly took a starting point off the shelf. The Save
   * button did that once per press; an autosave would have done it every time
   * somebody paused typing.
   */
  const draft: DesignDraft = { title, doc, isTemplate }

  const autosave = useDesignAutosave({
    draft,
    initial: { title: design.title, doc: design.doc, isTemplate: design.is_template },
    save: async (attempt) => {
      const result = await saveDesign({
        id: design.id,
        title: attempt.title,
        presetId: design.preset_id,
        doc: attempt.doc,
        isTemplate: attempt.isTemplate,
      })
      if (!result.ok) return { ok: false, message: result.message }
      // The snapshot is what came BACK, so a server that normalised anything
      // does not leave this editor writing the same row forever.
      return {
        ok: true,
        saved: {
          title: result.design.title,
          doc: result.design.doc,
          isTemplate: result.design.is_template,
        },
      }
    },
  })
  const dirty = autosave.dirty
  const [templateNote, setTemplateNote] = useState<string | null>(null)
  const [flagging, startFlag] = useTransition()
  /**
   * Whether Delete has been pressed once.
   *
   * `deleteDesign` is a hard delete with no trash behind it, and this used to
   * be one press of a button sitting beside Save in an editor somebody is
   * typing in. `delete-copy.ts` argues why asking is not the same as inventing
   * a consequence.
   */
  const [armedToDelete, setArmedToDelete] = useState(false)

  const template = templateById(doc.templateId)
  const preset = presetById(design.preset_id)

  // Clamped rather than trusted: removing the last slide leaves `pageAt` past
  // the end for one render, and an editor that reads `undefined` there shows
  // the "this design cannot be opened" panel for a design that is perfectly
  // fine.
  const activeIndex = Math.min(pageAt, doc.pages.length - 1)
  const page = doc.pages[activeIndex]

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

  /** What the save status line says, or nothing when there is nothing to say. */
  const saveSaid = describeSaveState(autosave.state, dirty, autosave.blocked)

  /** What the confirmation says, from facts this editor already holds. */
  const deletePrompt = describeDesignDelete({
    pageCount: doc.pages.length,
    isTemplate,
  })

  /** The text blocks, so each box knows the budget its own layout allows. */
  const textBlocks = new Map<string, TextBlock>(
    template.blocks.filter((b): b is TextBlock => b.kind === 'text').map((b) => [b.slot, b]),
  )

  function setSlot(key: string, text: string) {
    setNote(null)
    setDoc((current) => {
      const pages = current.pages.map((p, index) =>
        index === activeIndex
          ? { ...p, slots: { ...p.slots, [key]: { kind: 'text' as const, text } } }
          : p,
      )
      return { ...current, pages }
    })
  }

  /** Point a slot at a picture, and read its bytes so the preview is the export. */
  function chooseImage(key: string, assetId: string) {
    setNote(null)
    setDoc((current) => ({
      ...current,
      pages: current.pages.map((p, index) =>
        index === activeIndex
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
    setNote(null)
    setDoc((current) => ({
      ...current,
      pages: current.pages.map((p, index) =>
        index === activeIndex
          ? { ...p, slots: { ...p.slots, [key]: { kind: 'empty' as const } } }
          : p,
      ),
    }))
  }

  /**
   * Add a slide.
   *
   * The new one is opened straight away, because adding a page you then have to
   * go and find is a press that appears to do nothing on a narrow screen where
   * the strip has scrolled.
   */
  function addSlide() {
    if (template === null) return
    setNote(null)
    setDoc((current) => {
      const next = addPage(current, slotKeysOf(template))
      // Unchanged means the cap refused it. The button is disabled there, so
      // this is the rule underneath the button rather than a second copy of it.
      if (next !== current) setPageAt(next.pages.length - 1)
      return next
    })
  }

  /**
   * Move the slide being edited one place.
   *
   * The view follows it. A slide that moves while the editor keeps looking at
   * the position it left would show a different slide's words in the fields
   * somebody is typing in, which is the same defect as a stale preview.
   *
   * `movePage` refuses a target past either end by returning the same document,
   * so the buttons are disabled there AND the rule holds underneath them.
   */
  function moveSlide(by: -1 | 1) {
    const to = activeIndex + by
    // Computed from `doc` rather than inside a `setDoc` updater: an updater
    // that calls another setter is not pure, and React runs it twice in
    // development to catch exactly that.
    const next = movePage(doc, activeIndex, to)
    if (next === doc) return
    setDoc(next)
    setPageAt(to)
    // Announced, because somebody who is not watching the strip gets no other
    // signal: the chips are the only thing that changed, and the fields keep
    // the same words because the view follows the slide.
    setNote(`Moved to slide ${to + 1} of ${doc.pages.length}.`)
  }

  /** Remove the slide being edited. The last one cannot go; the button is absent there. */
  function removeSlide() {
    setNote(null)
    setDoc((current) => {
      const next = removePage(current, activeIndex)
      if (next !== current) setPageAt(Math.max(0, activeIndex - 1))
      return next
    })
  }

  /** Keep this design as a starting point, or put it back among the designs. */
  function toggleTemplate() {
    setNote(null)
    setTemplateNote(null)
    startFlag(async () => {
      const result = await setDesignTemplate({ designId: design.id, isTemplate: !isTemplate })
      if (!result.ok) {
        setTemplateNote(result.message)
        return
      }
      setIsTemplate(result.isTemplate)
      setTemplateNote(result.message)
      router.refresh()
    })
  }

  /**
   * Write it down now, and tell the gallery.
   *
   * The same flush the autosave uses, so a press mid-pause cannot race the
   * timer into two writes. What the button adds is the `router.refresh()` the
   * autosave deliberately does not do: a new title has to reach the gallery,
   * but not on every pause in a sentence.
   */
  function save() {
    setNote(null)
    startSave(async () => {
      if (await autosave.flush()) router.refresh()
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
  function exportToLibrary(everySlide: boolean) {
    setNote(null)
    setExported(null)
    startExport(async () => {
      // Through the same flush, so an export pressed while the autosave timer
      // is running cannot become two writes of the same row.
      if (!(await autosave.flush())) return

      // The page being LOOKED AT, not page one. Exporting a slide a person
      // cannot see would hand them a picture of something else.
      const result = everySlide
        ? await exportDesignPages(design.id)
        : await exportDesign({ designId: design.id, pageIndex: activeIndex })
      if (!result.ok) {
        setNote(result.message)
        return
      }
      setExported(result.message)
      router.refresh()
    })
  }

  function remove() {
    // The first press only arms it. The sentence a person reads before the
    // second one names what goes and what stays.
    if (!armedToDelete) {
      setNote(null)
      setArmedToDelete(true)
      return
    }
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

        {/* ── SLIDES ──────────────────────────────────────────────────────────
            One design can be up to ten slides. The strip is shown even for a
            single page, because "add a slide" is how a person finds out a
            carousel is possible at all, and a control that appears only once
            you already have two is a feature nobody discovers. */}
        <div className="flex flex-wrap items-center gap-2" data-guide="studio-slides">
          <ul className="flex flex-wrap items-center gap-1">
            {doc.pages.map((_, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => setPageAt(index)}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  className={`surface-ring size-control rounded-sm type-sm num transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    index === activeIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-s2 text-muted'
                  }`}
                >
                  {index + 1}
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            onClick={addSlide}
            disabled={doc.pages.length >= MAX_CAROUSEL_PAGES || saving || exporting}
          >
            Add a slide
          </Button>
          {doc.pages.length <= 1 ? null : (
            <>
              {/* Order is what a carousel MEANS: slide one is the hook and the
                  last one is the offer. Without these a slide could only be put
                  in the middle by deleting everything after it and typing it
                  again. Disabled rather than hidden at the ends, so the pair
                  does not move around under somebody's finger. */}
              <Button
                type="button"
                variant="ghost"
                onClick={() => moveSlide(-1)}
                disabled={activeIndex === 0 || saving || exporting}
              >
                Move left
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => moveSlide(1)}
                disabled={activeIndex === doc.pages.length - 1 || saving || exporting}
              >
                Move right
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={removeSlide}
                disabled={saving || exporting}
              >
                Remove this slide
              </Button>
            </>
          )}
          {doc.pages.length < MAX_CAROUSEL_PAGES ? null : (
            <span className="type-sm text-muted">
              <span className="num">{MAX_CAROUSEL_PAGES}</span> slides is as many as Instagram and
              Facebook will publish.
            </span>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="type-sm text-muted">What you call this design</span>
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value.slice(0, 80))
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
          {/* Still here, and still the way to make a failed save try again. What
              it no longer is, is the only thing standing between a few minutes
              of typing and losing it: the design is written down whenever
              somebody stops typing and on every way out of this screen. */}
          <Button onClick={save} loading={saving} disabled={!dirty || autosave.blocked !== null}>
            Save design
          </Button>
          <Button
            variant="secondary"
            onClick={() => exportToLibrary(false)}
            loading={exporting}
            disabled={saving}
            data-guide="studio-export"
          >
            {doc.pages.length > 1 ? 'Add this slide to your library' : 'Add to library'}
          </Button>
          {/* Only when there is more than one, because "add all 1 slides" is a
              button that describes the product as more complicated than it is. */}
          {doc.pages.length > 1 ? (
            <Button
              variant="secondary"
              onClick={() => exportToLibrary(true)}
              loading={exporting}
              disabled={saving}
            >
              Add all <span className="num">{doc.pages.length}</span> slides
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={remove}
            disabled={saving || exporting}
            data-guide="studio-delete"
          >
            {armedToDelete ? deletePrompt.confirm : DELETE_AT_REST}
          </Button>
          {/* A way out that is not the destructive button, and it is only
              present while there is something to back out of. */}
          {armedToDelete ? (
            <Button variant="secondary" onClick={() => setArmedToDelete(false)} disabled={saving}>
              {DELETE_CANCEL}
            </Button>
          ) : null}
          {/* One line for both, and the save state first, because a save that
              failed is the sentence somebody has to act on. `note` carries what
              the pickers and the export said. */}
          {saveSaid === null ? null : (
            <span
              role="status"
              className={`type-sm ${
                autosave.state.kind === 'failed' || autosave.blocked !== null
                  ? 'text-ink'
                  : 'text-muted'
              }`}
            >
              {saveSaid}
            </span>
          )}
          {note === null ? null : (
            <span role="status" className="type-sm text-muted">
              {note}
            </span>
          )}
        </div>

        {!armedToDelete ? null : (
          <p role="alert" className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
            {deletePrompt.detail}
          </p>
        )}

        {exported === null ? null : (
          <p role="status" className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
            {exported}{' '}
            <Link
              href="/assets"
              className="underline transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Open your library
            </Link>
          </p>
        )}

        <p className="type-sm text-muted">
          Adding a design to your library costs nothing. Sahoda draws it, so no credits are spent.
        </p>

        {/* ── A STARTING POINT ────────────────────────────────────────────────
            The consequence is named BEFORE the press, not after: keeping a
            design moves it out of "your designs", and a person who was not told
            watches it vanish from the list they were looking at and reads that
            as deletion. */}
        <div
          className="surface-ring flex flex-col gap-2 rounded-card bg-surface p-3"
          data-guide="studio-template-flag"
        >
          <h3 className="type-h3">
            {isTemplate ? 'This is a starting point' : 'Keep this as a starting point'}
          </h3>
          <p className="type-sm max-w-[68ch] text-muted">
            {isTemplate
              ? 'It sits under your starting points rather than your designs, and every new design made from it begins with these words and pictures. Nothing was copied: this is the same design.'
              : 'It moves out of your designs and into your starting points, where you can begin a new design from it whenever you like. Nothing is copied and nothing is deleted.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={toggleTemplate}
              loading={flagging}
              disabled={saving || exporting}
            >
              {isTemplate ? 'Put it back in your designs' : 'Keep as a starting point'}
            </Button>
            {templateNote === null ? null : (
              <span role="status" className="type-sm text-muted">
                {templateNote}
              </span>
            )}
          </div>
        </div>
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
          {doc.pages.length > 1 ? (
            <>
              Slide <span className="num">{activeIndex + 1}</span> of{' '}
              <span className="num">{doc.pages.length}</span> &middot;{' '}
            </>
          ) : null}
          {preset.label} &middot; <span className="num">{preset.width}</span> by{' '}
          <span className="num">{preset.height}</span> pixels. This is the picture that exports, not
          a preview of it.
        </p>
      </section>
    </div>
  )
}
