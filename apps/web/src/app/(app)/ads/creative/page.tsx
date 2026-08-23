import { InertMediaSlot, InertPanel, NotRunningNote } from '@/components/roadmap/parts'
import { InertButton, InertField } from '@/components/roadmap/inert'

export const metadata = { title: 'Ad creative' }

/**
 * ADS · CREATIVE — one ad, several placements, and a different thing in each.
 *
 * ── THIS SCREEN IS THE PRODUCT'S OWN RULE, APPLIED TO PAID ──────────────────
 * Sahoda's posts already work this way: Instagram's caption is not LinkedIn's,
 * each channel gets its own body, and each publishes on its own. Paid is the
 * same rule one level down. A feed ad is square, a story is a full-height 9:16
 * with the bottom fifth eaten by the interface, and a search ad has no image at
 * all — it is thirty characters of headline. A tool that lets you upload one
 * picture and calls it four ads is not saving you work, it is producing three
 * bad ads.
 *
 * So the shape of this screen is the shape of the campaign grid on `/campaigns`,
 * turned sideways: one row of slots per placement, each with its own crop and
 * its own line. Same idea, drawn twice, on purpose — it is the one thing worth
 * carrying from the free part of the product into the paid part.
 *
 * ── EVERY SLOT IS EMPTY AND NONE OF THEM IS A DASH ──────────────────────────
 * The boxes are the placement's true aspect ratio and nothing else. No file
 * name, no size, no "0 assets" — there is no asset table behind this and no ad
 * account to upload to.
 */

/** The four placements, with the aspect ratio each platform actually serves. */
const PLACEMENTS = [
  { label: 'Feed', aspect: '1 / 1', note: 'Square. Read while scrolling, sound off.' },
  {
    label: 'Story',
    aspect: '9 / 16',
    note: 'Full height. The bottom fifth is covered by the app.',
  },
  { label: 'Reels', aspect: '9 / 16', note: 'Full height, and it has to survive being muted.' },
  {
    label: 'Search',
    aspect: '4 / 1',
    note: 'No picture at all. A headline with one line under it.',
  },
] as const

export default function AdsCreativePage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h2">Creative</h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            One ad is not one picture. Each placement gets its own crop and its own words, the same
            way each channel gets its own post body today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InertButton>Upload</InertButton>
          <InertButton primary>Write with Sahoda</InertButton>
        </div>
      </div>

      <InertPanel
        title="Placements"
        what="Every size this ad has to exist in, and what each one is really like."
      >
        <div className="grid grid-cols-4 gap-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
          {PLACEMENTS.map((placement) => (
            <div key={placement.label} className="flex flex-col gap-1">
              <InertMediaSlot label={placement.label} aspect={placement.aspect} />
              <p className="type-sm text-muted">{placement.note}</p>
            </div>
          ))}
        </div>
      </InertPanel>

      <InertPanel
        title="The words"
        what="A headline and a body for each placement. Not one caption stretched over four shapes."
      >
        <div className="grid gap-3 narrow:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Headline</span>
            <InertField label="Thirty characters, and Search will cut it there" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Body</span>
            <InertField label="One sentence. Sound is off and the thumb is moving." />
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Call to action</span>
            <InertField label="What you want them to do. The platform picks from a fixed list" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Where it sends them</span>
            <InertField label="A page on your site, a WhatsApp thread, or a call" />
          </div>
        </div>
      </InertPanel>

      <NotRunningNote>
        Nothing here uploads, saves or generates. When it does, the writing will go through the same
        Brand Brain and the same refusal gate your posts already pass. An ad that Sahoda would not
        let you publish for free is not one it should let you pay to show.
      </NotRunningNote>
    </div>
  )
}
