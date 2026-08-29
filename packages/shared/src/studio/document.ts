import { z } from 'zod'

/**
 * WHAT A SAVED DESIGN IS, AND WHY IT IS SLOTS RATHER THAN SHAPES.
 *
 * ── THE PRODUCT RULING THIS SHAPE ENFORCES ──────────────────────────────────
 * FSD 3.4: "editable text/image slots only (no free canvas in v1 — predictable
 * output, low support burden)". The /studio page says the same thing to
 * customers in its own words. Founder confirmed it on 2026-08-28.
 *
 * So a stored design does NOT contain positions, sizes, colours or fonts. It
 * names a template and carries what the person TYPED. Everything about where a
 * thing sits comes from the template at render time, which is what makes an
 * off-brand export structurally impossible rather than merely discouraged: there
 * is nowhere in this schema to put a bad layout.
 *
 * It also means a template can be improved after a design is saved, and every
 * design made from it improves too. A document that stored coordinates would
 * freeze each customer's design at the moment they made it.
 *
 * ── AND WHY THAT IS NOT A DEAD END IF THE CANVAS ARRIVES ────────────────────
 * `SvgScene` in `svg.ts` already accepts free positions, because the RENDERER
 * has to. If a later ruling opens the canvas, this schema gains a second
 * document kind beside the slot one and old designs keep opening. The renderer
 * does not change at all. That is the whole reason the two were kept apart.
 *
 * ── THE VERSION FIELD IS NOT DECORATION ─────────────────────────────────────
 * `v` is a literal, so a document written by a future shape fails THIS parser
 * loudly instead of being read as a v1 document with fields silently missing.
 * A design is parsed per row (see the migration header), so one unreadable
 * design costs one card in the gallery.
 *
 * Pure: no I/O, no clock, no database.
 */

/** A slot the person left alone. Not the same as an empty string, which they typed. */
export const EmptySlotSchema = z.object({ kind: z.literal('empty') })

/**
 * Words. The template decides the size, the weight, the colour and where it
 * sits; this is only what it says.
 *
 * 2000 is a ceiling against a stored row nothing can render, not a design rule:
 * the template's own slot definition holds the length that actually fits, and
 * the editor shows that one. Two limits exist because they answer different
 * questions — "will this fit the box" and "is this a document or an attack".
 */
export const TextSlotSchema = z.object({
  kind: z.literal('text'),
  text: z.string().max(2000),
})

/**
 * A picture from the customer's own library, by id.
 *
 * NEVER a URL. A stored URL would go stale when a signed link expires, would
 * survive the file being deleted, and would let a design point at an address
 * outside this workspace. The id is resolved at render time by code that already
 * holds the credentials and already checks the workspace, and the renderer is
 * handed bytes rather than an address (`svg.ts` refuses anything but a data URI).
 */
export const ImageSlotSchema = z.object({
  kind: z.literal('image'),
  assetId: z.uuid(),
})

export const SlotValueSchema = z.discriminatedUnion('kind', [
  EmptySlotSchema,
  TextSlotSchema,
  ImageSlotSchema,
])
export type SlotValue = z.infer<typeof SlotValueSchema>

/** A slot key as a template declares it. Narrow on purpose: it is a code identifier, not prose. */
export const SlotKeySchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9-]*$/, 'a slot key is lowercase letters, digits and hyphens')

/** One page of a design. A single post has one; a carousel has several. */
export const DesignPageSchema = z.object({
  slots: z.record(SlotKeySchema, SlotValueSchema),
})
export type DesignPage = z.infer<typeof DesignPageSchema>

/**
 * ── 1 TO 10 PAGES, AND THE LOWER BOUND IS 1 RATHER THAN 2 ───────────────────
 * FSD 3.4 says a carousel is "2-10 slides", confirmed by the founder. That is
 * the rule for a CAROUSEL, and this schema also has to hold an ordinary
 * single-image post, which is one page. A floor of 2 here would make the
 * commonest design in the product unrepresentable.
 *
 * So the two live at different levels: the document allows 1 to 10, and
 * `isCarousel` below is what names the 2 boundary. `MAX_PAGES` is 10 in both
 * readings, and the ceiling is the one a platform enforces — Instagram and
 * Facebook both cap a carousel at 10 (`maxMediaCount` in the Constraint Engine),
 * so an eleventh page could be made and never published.
 */
export const MIN_PAGES = 1
export const MAX_CAROUSEL_PAGES = 10

export const DesignDocumentSchema = z.object({
  v: z.literal(1),
  templateId: z.string().min(1).max(60),
  pages: z.array(DesignPageSchema).min(MIN_PAGES).max(MAX_CAROUSEL_PAGES),
})
export type DesignDocument = z.infer<typeof DesignDocumentSchema>

/** More than one page is a carousel. One is a post. */
export function isCarousel(doc: DesignDocument): boolean {
  return doc.pages.length >= 2
}

/**
 * Read a slot, whatever state it is in.
 *
 * ── THREE ANSWERS, NOT TWO ──────────────────────────────────────────────────
 * A slot the template declares and the person has not filled, a slot they filled
 * with an empty string, and a slot the template does not have at all are three
 * different situations. Returning `''` for all of them would let the editor show
 * a filled-looking empty box for a slot that does not exist.
 */
export function slotOf(page: DesignPage, key: string): SlotValue | null {
  return page.slots[key] ?? null
}

/** The words in a slot, or null when it holds no words. Never a fabricated empty string. */
export function textOf(page: DesignPage, key: string): string | null {
  const slot = slotOf(page, key)
  return slot !== null && slot.kind === 'text' ? slot.text : null
}

/** The asset a slot points at, or null. */
export function imageIdOf(page: DesignPage, key: string): string | null {
  const slot = slotOf(page, key)
  return slot !== null && slot.kind === 'image' ? slot.assetId : null
}

/**
 * Every asset a design references, deduplicated, in page order.
 *
 * Read before rendering, so the bytes can be fetched once and handed in, and
 * read by the delete gate so a photo cannot vanish out from under a saved
 * design without anybody being told.
 */
export function assetIdsOf(doc: DesignDocument): string[] {
  const seen = new Set<string>()
  for (const page of doc.pages) {
    for (const slot of Object.values(page.slots)) {
      if (slot.kind === 'image') seen.add(slot.assetId)
    }
  }
  return [...seen]
}

/**
 * An empty design for a template, with every slot present and unfilled.
 *
 * Every declared slot appears rather than being left out, because "this slot
 * exists and is empty" is what the editor needs to draw a box to type into.
 */
export function blankDocument(templateId: string, slotKeys: readonly string[]): DesignDocument {
  return { v: 1, templateId, pages: [blankPage(slotKeys)] }
}

/** One empty page of a template: every declared slot present, none filled. */
export function blankPage(slotKeys: readonly string[]): DesignPage {
  const slots: Record<string, SlotValue> = {}
  for (const key of slotKeys) slots[key] = { kind: 'empty' }
  return { slots }
}

/**
 * ── ADDING AND REMOVING SLIDES ──────────────────────────────────────────────
 *
 * Both refuse by returning the document UNCHANGED rather than throwing or
 * returning null. A refused press is not an error a person needs told about:
 * the button that would go past the limit is disabled, and this is the rule
 * underneath it rather than a duplicate of it. Returning the same object also
 * means a caller that ignores the refusal cannot corrupt a document.
 *
 * The two limits are not symmetrical and the asymmetry is the product:
 * `MAX_CAROUSEL_PAGES` is what a PLATFORM enforces (Instagram and Facebook both
 * cap a carousel at 10, per the Constraint Engine's `maxMediaCount`), so an
 * eleventh slide could be made and never published. The floor of 1 is what a
 * DOCUMENT is: a design with no pages is not an empty carousel, it is nothing.
 */
export function addPage(doc: DesignDocument, slotKeys: readonly string[]): DesignDocument {
  if (doc.pages.length >= MAX_CAROUSEL_PAGES) return doc
  return { ...doc, pages: [...doc.pages, blankPage(slotKeys)] }
}

/** Remove one slide. The last one cannot go: a design with no pages is not a design. */
export function removePage(doc: DesignDocument, index: number): DesignDocument {
  if (doc.pages.length <= MIN_PAGES) return doc
  if (!Number.isInteger(index) || index < 0 || index >= doc.pages.length) return doc
  return { ...doc, pages: doc.pages.filter((_, at) => at !== index) }
}
