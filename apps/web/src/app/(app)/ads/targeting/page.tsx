import { Building2, MapPin, Repeat, Users } from 'lucide-react'

import { InertPanel, InertRow, NotRunningNote } from '@/components/ads/inert-parts'
import { InertButton, InertChip, InertField } from '@/components/roadmap/inert'

export const metadata = { title: 'Ad audience' }

/**
 * ADS · AUDIENCE — who sees it, and the number this screen refuses to show.
 *
 * ── THE MISSING REACH ESTIMATE IS THE MOST IMPORTANT THING HERE ──────────────
 * Every ad tool in existence puts a live figure under its audience builder:
 * "estimated reach 41,000 – 120,000". It updates as you drag the radius, and it
 * is the single most persuasive object on the screen. It is also a number about
 * the reader's own market, and Sahoda has no ad account, no platform estimate
 * endpoint and no impression data — so any figure rendered there would be
 * invented, and it would be invented in the one place a small business owner is
 * most likely to make a spending decision from it.
 *
 * A range would be worse than a point estimate, not better: a range LOOKS like
 * measured uncertainty. So there is no reach figure on this screen at all, and
 * the panel that would hold one says why in words instead. When the platform
 * connection exists, the estimate will come from the platform and be labelled as
 * the platform's.
 *
 * ── THE BRAND BRAIN IS ALREADY HALF OF THIS ─────────────────────────────────
 * `brand_memory` holds a described customer today. That is the honest link
 * between the free product and the paid one, and it is worth showing: the work a
 * customer already did on their Brand Brain is not thrown away when ads arrive.
 */

const SOURCES = [
  {
    icon: MapPin,
    name: 'Around your business',
    note: 'A pin and a radius. For most small businesses this is the whole audience.',
  },
  {
    icon: Users,
    name: 'The customer your Brand Brain describes',
    note: 'Sahoda already holds who you say you sell to. That becomes the starting point rather than a form you fill again.',
  },
  {
    icon: Repeat,
    name: 'People who already know you',
    note: 'Visitors to your site and people who messaged you. Needs its own permission from the platform.',
  },
  {
    icon: Building2,
    name: 'People like your customers',
    note: 'The platform builds this from a list you give it. Sahoda never sends one without asking.',
  },
] as const

export default function AdsTargetingPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h2">Audience</h2>
          <p className="type-body mt-1 max-w-[68ch] text-muted">
            Who this ad is shown to. Most of it Sahoda can already describe from your Brand Brain.
          </p>
        </div>
        <InertButton primary>Save audience</InertButton>
      </div>

      <InertPanel title="Where they are" what="A place and how far around it to go.">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">Place</span>
            <InertField label="A city, a neighbourhood, or a pin on a map" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="type-eyebrow text-muted">How far around it</span>
            <div className="flex flex-wrap gap-1.5">
              <InertChip on>Walking distance</InertChip>
              <InertChip>A short drive</InertChip>
              <InertChip>The whole city</InertChip>
            </div>
          </div>
        </div>
      </InertPanel>

      <InertPanel
        title="Who they are"
        what="Four ways to name an audience. The second one you have already done."
      >
        <div className="grid gap-2 md:grid-cols-2">
          {SOURCES.map((source) => (
            <InertRow key={source.name} icon={source.icon} name={source.name} note={source.note} />
          ))}
        </div>
      </InertPanel>

      {/* The panel where the reach estimate would go. It holds a sentence
          instead — see the header. This is deliberately a REAL section with a
          real heading rather than an omission, because the absence needs to be
          explained where the reader expects the number. */}
      <section className="surface-ring flex flex-col gap-1 rounded-card bg-surface p-4">
        <h3 className="type-h3">How many people this would reach</h3>
        <p className="type-body max-w-[68ch] text-muted">
          Sahoda will not show a figure here until a platform gives it one. Other tools put a live
          estimate under this box and move it as you drag the radius — it is convincing, it is the
          thing people budget against, and with no ad account connected it would be a number Sahoda
          made up about your market. When the connection exists, the estimate will come from Meta or
          Google and will say so.
        </p>
      </section>

      <NotRunningNote>
        Nothing on this screen saves an audience or asks a platform anything. Your Brand Brain is
        untouched by it.
      </NotRunningNote>
    </div>
  )
}
