import Link from 'next/link'
import type { Channel, Connection } from '@sahoda/shared'

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
        <Link
          href={href}
          className="card-link ml-auto text-[12px] font-[550] text-muted hover:text-accent"
        >
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

          {/* ── THE REFERENCE'S SIX TILES ────────────────────────────────────
              Reference card: 380x231 with six — Brand Voice, Writing Style,
              Primary Color, Audience, Competitors "12 tracked", Knowledge
              "120 docs". This app's card was 380x151 and had none of them.

              TWO of the six have a real source and are filled from the brain:
              voice.descriptor and voice.formality_label.

              THE OTHER FOUR RENDER AN EM DASH, AND THAT IS THE POINT.
                Primary color   the workspace theme is not applied here, and a
                                swatch would claim one exists
                Audience        customer_persona holds a one-liner, a pain point,
                                a fear and a desired identity — no age range.
                                "25–45 yrs" has no field to come from
                Competitors     there is no competitors table. "12 tracked" would
                                be a count of a thing that does not exist
                Knowledge       there is no document library. Same.
              A container with a label and a dash is honest; the reference's
              numbers here are fixture data about a business we cannot read. */}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line-soft pt-3">
            {(
              [
                ['Brand voice', brain.active.voice?.descriptor?.trim() || null],
                ['Writing style', brain.active.voice?.formality_label?.trim() || null],
                ['Primary colour', null],
                ['Audience', null],
                ['Competitors', null],
                ['Knowledge', null],
              ] as ReadonlyArray<readonly [string, string | null]>
            ).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-[11px] text-muted">{label}</dt>
                <dd
                  className={`truncate text-[12.5px] ${value ? 'font-[550] text-ink' : 'text-muted'}`}
                  title={value ?? undefined}
                >
                  {value ?? '—'}
                </dd>
              </div>
            ))}
          </dl>
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
/** Every channel this product has an adapter for, in the reference's order. */
const CONNECTABLE: readonly Channel[] = ['instagram', 'linkedin', 'x', 'gbp']

export function ConnectionsCard({ connections }: { connections: Connection[] | null }) {
  return (
    <RailCard title="Connections" href="/connections" linkLabel="Manage">
      {connections === null ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted">
          Couldn&rsquo;t check your connections just now.
        </p>
      ) : connections.length === 0 ? (
        /* ── THE TILES STAND EVEN WITH NOTHING CONNECTED ──────────────────────
           This was one sentence, so a new workspace — which is every workspace
           on day one — could not see WHICH channels Sahoda can post to. The
           reference shows the platform row regardless; the tiles are structure
           and the connection state is content.

           Each tile says "Not connected" rather than being greyed out, because
           writing and planning genuinely work without a connection: this is not
           a blocked state, it is an empty one. */
        <>
          <ul className="grid grid-cols-2 gap-2 p-4 pb-2">
            {CONNECTABLE.map((channel) => (
              <li key={channel}>
                <Link
                  href="/connections"
                  className="surface-ring flex items-center gap-2 rounded-[8px] p-2 transition-micro hover:shadow-[inset_0_0_0_1px_var(--line-firm)]"
                >
                  <ChannelLogo channel={channel} size={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-[550] text-ink">
                      {CHANNEL_LABELS[channel]}
                    </span>
                    <span className="block text-[11px] text-muted">Not connected</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-4 text-[12px] text-muted">
            You can write and plan without one. Connecting is what lets a post actually go out.
          </p>
        </>
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
