import Link from 'next/link'
import type { Connection } from '@sahoda/shared'

import { ChannelLogo } from '@/components/connections/channel-logo'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { brainRing } from '@/lib/brand/brain-ring'
import type { BrainRead } from '@/lib/brand/read-brain'

/**
 * The right rail's cards (reference: `.card` with `.card__head` + `.card__body`).
 *
 * Both answer the reference's fourth question — "what should I do next?" — by
 * showing the two things that make everything else work: what Sahoda knows
 * about you, and what it can post to. Both are ENTRY POINTS, not editors: every
 * tile is a link to the page that owns the data.
 */

/** Shared card chrome so the rail reads as one stack, not three inventions. */
function RailCard({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string
  href: '/brain' | '/connections'
  linkLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="surface-ring rounded-card bg-surface">
      <header className="flex min-h-[46px] items-center gap-3 border-b border-line-soft px-4 py-3">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
        <Link href={href} className="ml-auto text-[12px] font-[550] text-muted hover:text-accent">
          {linkLabel}
        </Link>
      </header>
      {children}
    </section>
  )
}

/**
 * Brand Brain — the reference shows six labelled tiles.
 *
 * THE CONFIRMATION COUNT IS THE POINT and it has no equivalent in the
 * reference, whose fixtures are simply present. Here a field can be inferred or
 * confirmed by a person, and only the second is a fact about the business. So
 * the card leads with `confirmed / total` rather than with six values that
 * would all look equally true.
 */
export function BrainCard({ brain }: { brain: BrainRead }) {
  return (
    <RailCard title="Brand Brain" href="/brain" linkLabel="View all">
      {brain.status === 'ok' ? (
        <div className="px-4 py-4">
          <p className="flex items-baseline gap-2">
            <span className="text-[24px] leading-none font-[650] tabular-nums">
              {brainRing(brain.provenance).confirmed}
            </span>
            <span className="text-[13px] text-muted">
              of {brainRing(brain.provenance).total} fields confirmed
            </span>
          </p>
          <p className="mt-2 text-[12px] text-muted">
            Confirmed means a person checked it. The rest are still Sahoda&rsquo;s reading of what
            it found.
          </p>
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-[13px] text-muted">
          {brain.status === 'unreadable'
            ? 'Couldn’t read the Brand Brain just now.'
            : 'Sahoda doesn’t know your brand yet.'}
        </p>
      )}
    </RailCard>
  )
}

/**
 * Connections — the reference's 4-column grid of channel tiles with a status
 * dot. The dot is ALWAYS paired with a word (SPECIFICATION.md §11): a dot alone
 * carries meaning in colour, which this palette cannot do.
 */
export function ConnectionsCard({ connections }: { connections: Connection[] | null }) {
  return (
    <RailCard title="Connections" href="/connections" linkLabel="Manage">
      {connections === null ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted">
          Couldn&rsquo;t check your connections just now.
        </p>
      ) : connections.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted">
          Nothing connected yet. You can write and plan without one.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 p-4">
          {connections.slice(0, 4).map((connection) => (
            <li key={connection.id}>
              <Link
                href="/connections"
                className="surface-ring flex items-center gap-2 rounded-[8px] p-2 transition-micro hover:shadow-[inset_0_0_0_1px_var(--line-firm)]"
              >
                <ChannelLogo channel={connection.platform} size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-[550] text-ink">
                    {CHANNEL_LABELS[connection.platform]}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {connection.status === 'active' ? 'Connected' : 'Needs attention'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  )
}
