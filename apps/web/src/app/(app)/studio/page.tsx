import Link from 'next/link'
import { Layers, Palette, Quote, Type } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { PageTitle } from '@/components/page-title'
import { InertButton, InertChip, RoadmapBanner } from '@/components/roadmap/inert'
import { InertMediaSlot, InertPanel, InertRow, NotRunningNote } from '@/components/roadmap/parts'

export const metadata = { title: 'Studio' }

/**
 * STUDIO — templates that are locked to your brand, and a canvas that is not there.
 *
 * ── THE ONE DECISION WORTH RECORDING ─────────────────────────────────────────
 * FSD M3.4: "no free canvas in v1 — predictable output, low support burden".
 * That is not a shortcut, it is the product position. A free canvas produces
 * off-brand output the customer then blames the brand system for, and it
 * generates the support load of a design tool for a company that is not one.
 * Editable text and image SLOTS in a locked layout produce something on-brand
 * every time, which is what somebody running a shop between customers needs.
 *
 * If a later session is asked for drag-and-drop layers, the reason it is absent
 * is here rather than in a doc nobody opens.
 *
 * ── THE SLOTS ARE DRAWN AT THEIR REAL PROPORTIONS ────────────────────────────
 * A carousel slide is square, a story is 9:16, a quote card is 4:5. On a
 * template screen the SHAPE is the information — it is what makes "one idea,
 * three placements" legible without a word — so `InertMediaSlot` pins one height
 * and derives each width from the aspect, keeping the row on a flat baseline.
 *
 * ── PRICES YES, GALLERY NUMBERS NO ───────────────────────────────────────────
 * The export price is in pricing.config.json and is a fact about Sahoda. There
 * is no template count, no "used 1,200 times", and no popularity ordering:
 * there are no templates rendered and no exports have happened.
 */

const KINDS = ['All', 'Posts', 'Carousels', 'Quote cards', 'Stories'] as const

const SHAPES = [
  { label: 'Feed post', aspect: '1 / 1' },
  { label: 'Portrait post', aspect: '4 / 5' },
  { label: 'Story', aspect: '9 / 16' },
  { label: 'Wide card', aspect: '16 / 9' },
] as const

export default function StudioPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="Make the picture, not just the caption — templates that already know your colours, your type and your logo.">
          Studio
        </PageTitle>
        <InertButton primary>New design</InertButton>
      </div>

      <RoadmapBanner what="Studio will render carousels, quote cards and post images from templates locked to your brand." />

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((kind, index) => (
          <InertChip key={kind} on={index === 0}>
            {kind}
          </InertChip>
        ))}
      </div>

      <p className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
        Nothing is saved yet. There is no gallery behind these filters &mdash; see below.
      </p>

      <section aria-labelledby="studio-shapes" className="flex flex-col gap-3">
        <div>
          <h2 id="studio-shapes" className="type-h2">
            The shapes it makes
          </h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            One idea, cropped and re-laid-out for each place it has to fit. Same rule your captions
            already follow: a separate version per channel, not one stretched to fit them all.
          </p>
        </div>
        <div className="grid gap-3 wide:grid-cols-4 max-wide:grid-cols-2">
          {SHAPES.map((shape) => (
            <InertMediaSlot key={shape.label} label={shape.label} aspect={shape.aspect} />
          ))}
        </div>
      </section>

      <section aria-labelledby="studio-editor" className="flex flex-col gap-3">
        <h2 id="studio-editor" className="type-h2">
          What you can change, and what you cannot
        </h2>
        <div className="grid gap-3 wide:grid-cols-2">
          <InertPanel
            title="Yours to edit"
            what="The parts that carry your message. Everything here is a field, not a layer."
          >
            <div className="grid gap-2">
              <InertRow
                icon={Type}
                name="The words"
                note="Headline, body and the call to action, each with a length the layout can actually hold."
              />
              <InertRow
                icon={Quote}
                name="The picture"
                note="From your library, from your phone, or generated — dropped into a slot that already knows its crop."
              />
              <InertRow
                icon={Layers}
                name="The slides"
                note="Two to ten, reordered, duplicated or dropped. A carousel is a sequence, so the order is yours."
              />
            </div>
          </InertPanel>

          <InertPanel
            title="Locked to your brand"
            what="The parts that keep every design looking like it came from the same business."
          >
            <div className="grid gap-2">
              <InertRow
                icon={Palette}
                name="Colour and type"
                note="Read from your Brand Brain and checked for contrast before it renders, the same guard the app itself passes through."
              />
              <InertRow
                icon={Layers}
                name="Layout and spacing"
                note="Fixed by the template. This is the trade: you cannot move a box, and nothing you export can come out off-brand."
              />
            </div>
            <p className="type-sm text-muted">
              {/* "FSD M3.4" used to be in this sentence. A customer does not
                  have the FSD and cannot look it up, and a spec reference in
                  user-facing copy is the implementation jargon CLAUDE.md's copy
                  style names as the one thing that actually gets caught here.
                  Caught by roadmap-honesty.spec.ts, which was looking for
                  invented figures and found the "4". The reasoning stays in the
                  file's docstring, where the reader who needs it is looking. */}
              There is no free canvas and no layer panel. Predictable output beats an open editor
              for a business with no designer.
            </p>
          </InertPanel>
        </div>
      </section>

      <section aria-labelledby="studio-cost" className="surface-ring rounded-card bg-surface p-4">
        <h2 id="studio-cost" className="type-h3">
          Exports are free, because the renderer is ours
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          A PNG or JPEG costs nothing &mdash; drawing it is our own code, not a model call, so there
          is nothing to charge for. Only the parts that call a model cost credits: a generated image
          into a slot at its usual price, and a carousel at{' '}
          <span className="num">{creditCost('carousel')}</span> credits.
        </p>
        {/* The spec also prices a short MP4 slideshow. That price is NOT in
            pricing.config.json, and a credit figure this app prints must come
            from that file or from nowhere — so the slideshow is named without
            one rather than quoted from a document the ledger does not read. */}
        <p className="type-sm mt-2 text-muted">
          A short video slideshow will be priced too. Its rate is not set in the price list yet, so
          this page does not quote one.
        </p>
      </section>

      {/* THE `templates` TABLE IS READ, AND IT IS NOT THIS.
          `lib/templates/read.ts` powers the composer's saved starting points —
          WORDS, a caption you keep and reuse. Studio is a renderer for pictures.
          Two different things under one English word, and a reader who has used
          the composer's templates would fairly wonder why this page says there
          are none. So the note names both and says which one is missing. */}
      <NotRunningNote>
        Nothing here renders yet. There is no gallery of designs to browse and no picture saved to
        your library &mdash; the starting points you can save in the composer are captions, not
        layouts. Pictures you already have live in{' '}
        <Link href="/assets" className="font-[550] text-accent underline underline-offset-2">
          Assets
        </Link>
        , and that part works today.
      </NotRunningNote>
    </div>
  )
}
