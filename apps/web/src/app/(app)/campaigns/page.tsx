import { MoreHorizontal, Sparkles, SlidersHorizontal } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { InertButton, InertChip, RoadmapBanner } from '@/components/roadmap/inert'

export const metadata = { title: 'Campaigns' }

/**
 * Campaigns, as the reference designs it — built, marked, and empty of figures.
 *
 * ── WHAT THE REFERENCE SHOWS, AND WHAT IS WITHHELD ───────────────────────────
 * Its card is: name + status badge · channel tiles + dates · "Spent ₹x / ₹y"
 * with a share bar · a three-up of Reach / Conv. / ROAS · a foot reading
 * "✦ Health 80" and an Open button. Its toolbar carries chips reading
 * "All 4 · Active 2 · Draft 1 · Completed 1".
 *
 * EVERY ONE of those numbers is a claim about the reader's business, and there
 * is no campaigns table in this product to make any of them from. So the card
 * keeps its shape and its labels — Spent, Reach, Conversions, ROAS, Health are
 * the things this screen will show — and each reads an em dash. The chips keep
 * their names and lose their counts, because a "0" would assert that the
 * collection exists and is empty.
 *
 * The share bar is omitted rather than drawn at 0%. A bar encodes a ratio; with
 * no spend and no budget there is no ratio, and an empty track reads as "you
 * have spent nothing of a real budget" rather than as "there is no budget".
 */

/** The card's own labels — the shape of what a campaign will report. */
const METRICS = ['Reach', 'Conversions', 'ROAS'] as const

/** Three cards, because the reference's grid is three across. Named by state. */
const PREVIEW_CARDS = [
  { title: 'A campaign you launched', status: 'Active' },
  { title: 'One still being written', status: 'Draft' },
  { title: 'One that has finished', status: 'Completed' },
] as const

export default function CampaignsPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle>Campaigns</PageTitle>
          <p className="mt-1 text-[13px] text-muted">Plan, launch and optimise campaigns.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InertButton>
            <Sparkles size={14} strokeWidth={1.8} aria-hidden />
            Improve campaign
          </InertButton>
          <InertButton>
            <SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden />
            Filter
          </InertButton>
          <InertButton primary>Create campaign</InertButton>
        </div>
      </div>

      <RoadmapBanner what="A campaign groups posts and paid spend under one goal, with one report." />

      {/* The reference's chips, with their counts removed. */}
      <div className="flex flex-wrap gap-1.5">
        <InertChip on>All</InertChip>
        <InertChip>Active</InertChip>
        <InertChip>Draft</InertChip>
        <InertChip>Completed</InertChip>
      </div>

      <div className="grid grid-cols-3 gap-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {PREVIEW_CARDS.map((card) => (
          <article
            key={card.title}
            className="is-proposed flex flex-col rounded-card"
            aria-label={`${card.title} — coming soon`}
          >
            <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted">
                {card.title}
              </span>
              <span className="shrink-0 text-[11px] font-[550] text-muted">{card.status}</span>
            </div>

            <div className="flex flex-col gap-3 px-3 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-muted">Channels</span>
                <span className="text-[11px] text-muted">Dates &mdash;</span>
              </div>

              {/* Spend keeps its label and shows no ratio. See the note above. */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-muted">Spent</span>
                <span className="text-[12px] font-[550] text-muted tabular-nums">&mdash;</span>
              </div>

              <dl className="grid grid-cols-3 gap-2">
                {METRICS.map((m) => (
                  <div key={m} className="min-w-0">
                    <dt className="truncate text-[11px] text-muted">{m}</dt>
                    <dd className="text-[13px] font-[550] text-muted tabular-nums">&mdash;</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex items-center gap-2 border-t border-line-soft px-3 py-2.5">
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <Sparkles size={12} strokeWidth={1.8} aria-hidden />
                Health &mdash;
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <InertButton className="px-2 py-[3px] text-[12px]">Open</InertButton>
                <span data-inert-control aria-hidden className="text-muted">
                  <MoreHorizontal size={15} strokeWidth={1.8} />
                </span>
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
