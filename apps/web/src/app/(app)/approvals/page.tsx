import { Check, Eye, MoreHorizontal, Sparkles, SlidersHorizontal, X } from 'lucide-react'

import { PageTitle } from '@/components/page-title'
import { InertButton, InertChip, RoadmapBanner } from '@/components/roadmap/inert'

export const metadata = { title: 'Approvals' }

/**
 * The supervision queue, as the reference designs it.
 *
 * ── WHY IT IS NOT WIRED TO POSTS ─────────────────────────────────────────────
 * The app already HAS an approval path: /posts carries the approve action and
 * /home's "Needs your attention" is the queue that reads it. This screen is the
 * reference's SEPARATE surface, which adds bulk select, keyboard review and an
 * AI review pass — none of which exists. Pointing it at posts would produce a
 * second, competing approvals screen with a different set of actions, which is
 * worse than one honest picture of what the real one will be.
 *
 * ── WHAT IS WITHHELD ─────────────────────────────────────────────────────────
 * The reference's header reads "5 awaiting review"; its chips read "All 5 ·
 * Urgent 1 · Content 2 · Campaigns 2 · Ads 1"; each row carries a reach figure.
 * Every one is a count of a queue this screen does not read, so the header keeps
 * its noun and drops its number, the chips keep their names, and the row's reach
 * slot renders an em dash beside its own icon.
 *
 * The keyboard hints (A approve · R reject · J K move) are kept because they
 * describe how the built screen will work, and they make no claim about data.
 */

const ROWS = [
  { title: 'A post waiting on you', meta: 'Someone sent this for review' },
  { title: 'One that is due soon', meta: 'Scheduled, needs a decision first' },
  { title: 'One Sahoda drafted', meta: 'Written from your Brand Brain' },
] as const

export default function ApprovalsPage() {
  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle>Approvals</PageTitle>
          <p className="mt-1 text-[13px] text-muted">Everything waiting on you, in one queue.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InertButton>
            <Sparkles size={14} strokeWidth={1.8} aria-hidden />
            Review with AI
          </InertButton>
          <InertButton>
            <SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden />
            Filter
          </InertButton>
          <InertButton>Due date</InertButton>
        </div>
      </div>

      <RoadmapBanner what="One queue for everything awaiting a decision, with bulk actions and keyboard review." />

      <div className="flex flex-wrap gap-1.5">
        <InertChip on>All</InertChip>
        <InertChip>Urgent</InertChip>
        <InertChip>Content</InertChip>
        <InertChip>Campaigns</InertChip>
        <InertChip>Ads</InertChip>
      </div>

      {/* The bulk bar. Present because it is most of why this screen exists. */}
      <div className="is-proposed flex flex-wrap items-center gap-2 rounded-card px-3 py-2.5">
        <span className="text-[12.5px] text-muted">With selected</span>
        <InertButton className="px-2 py-[3px] text-[12px]">
          <X size={13} strokeWidth={2} aria-hidden />
          Reject
        </InertButton>
        <InertButton primary className="px-2 py-[3px] text-[12px]">
          <Check size={13} strokeWidth={2} aria-hidden />
          Approve
        </InertButton>
      </div>

      <section className="is-proposed rounded-card" aria-label="Review queue — coming soon">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
          {/* The noun, without the count. */}
          <h2 className="text-[13px] font-semibold text-muted">Awaiting review</h2>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted max-narrow:hidden">
            <kbd className="rounded-sm bg-s2 px-[5px] py-[1px] font-medium">A</kbd> approve
            <kbd className="rounded-sm bg-s2 px-[5px] py-[1px] font-medium">R</kbd> reject
            <kbd className="rounded-sm bg-s2 px-[5px] py-[1px] font-medium">J</kbd>
            <kbd className="rounded-sm bg-s2 px-[5px] py-[1px] font-medium">K</kbd> move
          </span>
        </div>

        <ul>
          {ROWS.map((row) => (
            <li
              key={row.title}
              className="flex flex-wrap items-center gap-3 border-b border-line-soft px-3 py-3 last:border-b-0"
            >
              <span
                data-inert-control
                aria-hidden
                className="size-4 shrink-0 rounded-[4px] bg-s2 shadow-[inset_0_0_0_1px_var(--line)]"
              />
              <span aria-hidden className="size-8 shrink-0 rounded-sm bg-s2" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-muted">
                  {row.title}
                </span>
                <span className="mt-[1px] block truncate text-[12px] text-muted">{row.meta}</span>
              </span>
              <span className="flex flex-none items-center gap-1 text-[11px] text-muted">
                <Eye size={12} strokeWidth={1.8} aria-hidden />
                &mdash;
              </span>
              <span className="flex flex-none items-center gap-1.5">
                <InertButton className="px-2 py-[3px] text-[12px]">Edit</InertButton>
                <InertButton primary className="px-2 py-[3px] text-[12px]">
                  Approve
                </InertButton>
                <span data-inert-control aria-hidden className="text-muted">
                  <MoreHorizontal size={15} strokeWidth={1.8} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
