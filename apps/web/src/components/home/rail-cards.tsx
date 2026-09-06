import { Unmeasured } from '@/components/design-system/absence-row'
import Link from 'next/link'
import type { Channel, Connection } from '@sahoda/shared'

import { ChannelLogo } from '@/components/connections/channel-logo'
import { HomeSection } from '@/components/home/section'
import { PLATFORM_LABELS } from '@/components/posts/channel-label'
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

/**
 * Shared card chrome so the rail reads as one stack, not three inventions.
 *
 * It is now a thin adapter over `HomeSection`, which is the page's ONE card
 * language. This used to hand-write a third copy of the same ruled header, and
 * the drift was already visible: its trailing link had no arrow where the
 * activity card's did, on cards sitting one above the other in the same column.
 */
function RailCard({
  id,
  title,
  href,
  linkLabel,
  children,
}: {
  id: string
  title: string
  href: '/brain' | '/connections'
  linkLabel: string
  children: React.ReactNode
}) {
  return (
    <HomeSection id={id} title={title} action={{ href, label: linkLabel }}>
      {children}
    </HomeSection>
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
export function BrainCard({
  brain,
  knowledgeDocuments,
}: {
  brain: BrainRead
  /**
   * How many documents SEARCH CAN RETURN, from `countIndexedDocuments`.
   *
   * `null` is "the read did not answer" and renders the Unmeasured mark. A real
   * zero renders as 0 — that is knowledge, and the same rule `spend-card.tsx`
   * and `credit-chip.tsx` already follow.
   */
  knowledgeDocuments: number | null
}) {
  return (
    <RailCard id="home-brain" title="Brand Brain" href="/brain" linkLabel="View all">
      {brain.status === 'ok' ? (
        <div>
          <p className="flex items-baseline gap-2">
            <span className="type-h2 tabular-nums">{brainRing(brain.provenance).confirmed}</span>
            <span className="type-sm text-muted">
              of {brainRing(brain.provenance).total} answers checked by you
            </span>
          </p>
          <p className="mt-2 type-meta text-muted">
            Checked means you said it is right. The rest are Sahoda&rsquo;s best guess.
          </p>

          {/* ── TWO TILES, NOT THE REFERENCE'S SIX ───────────────────────────
              Reference card: six tiles — Brand Voice, Writing Style, Primary
              Color, Audience, Competitors "12 tracked", Knowledge "120 docs".

              TWO of those six have a real source here and are filled from the
              brain: voice.descriptor and voice.formality_label.

              THE OTHER FOUR ARE DELETED, and this is a reversal. They used to
              render a permanent em dash, on the argument that "a container with
              a label and a dash is honest". docs/26 §4 rules otherwise, and it
              is right: a dash is the mark for a slot that is REAL and not yet
              filled, so using it for a quantity that does not exist tells the
              reader their brand is incomplete when in fact this product has
              nowhere to put the answer.

                Primary colour  the workspace theme is not applied here
                Audience        customer_persona holds a one-liner, a pain
                                point, a fear and a desired identity — there is
                                no age range field for "25–45 yrs" to come from
                Competitors     there is no competitors table
                Knowledge       there is no document library

              These are docs/26 §4's third state — "there is no such quantity" —
              which renders NOTHING. Four permanent dashes on the most-visited
              screen in the product, gone. It is the same defect as `100 of —`
              (P2a) in a second file.

              ── KNOWLEDGE IS BACK, BECAUSE THE QUANTITY NOW EXISTS ──────────
              `knowledge_documents` was applied 2026-08-22. So "there is no
              document library" stopped being true, and the tile returns — but
              as a COUNT OF ROWS A QUERY RETURNED, never the reference design's
              "120 docs". It counts documents Sahoda has actually READ, not rows
              in the table: a document that failed to parse is not in the
              library in any sense the reader means. Zero renders as 0, which is
              knowledge; a failed read renders the `Unmeasured` mark, which is
              not the same claim.

              The other two are the FIRST state when unset: the slot is real,
              the reading has not arrived, so they carry the `Unmeasured` mark
              and its accessible name. */}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line-soft pt-3">
            {(
              [
                ['Brand voice', brain.active.voice?.descriptor?.trim() || null],
                ['Writing style', brain.active.voice?.formality_label?.trim() || null],
              ] as ReadonlyArray<readonly [string, string | null]>
            ).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate type-meta text-muted">{label}</dt>
                <dd
                  className={`truncate type-meta ${value ? 'font-[550] text-ink' : 'text-muted'}`}
                  title={value ?? undefined}
                >
                  {value ?? <Unmeasured what={label} />}
                </dd>
              </div>
            ))}
            <div className="min-w-0">
              <dt className="type-sm truncate text-muted">Knowledge</dt>
              <dd className="type-sm truncate font-[550] text-ink">
                {knowledgeDocuments === null ? (
                  <Unmeasured what="Knowledge" />
                ) : (
                  <Link href="/brain/knowledge" className="hover:text-accent">
                    <span className="num">{knowledgeDocuments}</span>{' '}
                    <span className="font-normal text-muted">
                      {knowledgeDocuments === 1 ? 'document' : 'documents'}
                    </span>
                  </Link>
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="type-sm text-muted">
          {brain.status === 'unreadable'
            ? 'Could not read the Brand Brain just now.'
            : 'Sahoda does not know your business yet.'}
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
    <RailCard id="home-connections" title="Connections" href="/connections" linkLabel="Manage">
      {connections === null ? (
        <p className="type-sm text-muted">Could not check your accounts just now.</p>
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
          <ul className="grid grid-cols-2 gap-2">
            {CONNECTABLE.map((channel) => (
              <li key={channel}>
                <Link
                  href="/connections"
                  className="surface-ring flex items-center gap-2 rounded-[8px] p-2 transition-micro hover:shadow-[inset_0_0_0_1px_var(--line-firm)]"
                >
                  <ChannelLogo channel={channel} size={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate type-meta font-[550] text-ink">
                      {PLATFORM_LABELS[channel]}
                    </span>
                    <span className="block type-meta text-muted">Not connected</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 type-meta text-muted">
            You can write and plan without one. Connect an account to really post.
          </p>
        </>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {connections.slice(0, 4).map((connection) => (
            <li key={connection.id}>
              <Link
                href="/connections"
                className="surface-ring flex items-center gap-2 rounded-[8px] p-2 transition-micro hover:shadow-[inset_0_0_0_1px_var(--line-firm)]"
              >
                <ChannelLogo channel={connection.platform} size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate type-meta font-[550] text-ink">
                    {PLATFORM_LABELS[connection.platform]}
                  </span>
                  <span className="block type-meta text-muted">
                    {connection.status === 'active' ? 'Connected' : 'Needs a fix'}
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
