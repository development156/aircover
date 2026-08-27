'use client'

import { Search, SearchX } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/empty-state'
import { KindGlyph } from '@/components/connections/kind-glyph'
import { ALL_KINDS, kindFacets, matchesQuery, type Categorised } from '@/lib/connections/kinds'
import { cn } from '@/lib/utils'

/**
 * THE BROWSE LAYER OF /connections — a category rail, a search field, and the
 * page's existing groups underneath.
 *
 * ── WHAT THIS COMPONENT DOES NOT OWN ─────────────────────────────────────────
 * Every card is handed in already rendered, as `tile`. This file never builds a
 * channel, never reads a connection, never knows what a connect flow is. It
 * filters and it lays out. That is deliberate: `ChannelTile` stays a server
 * component that renders `ConnectButton`, `ReconnectButton` and
 * `DisconnectButton` exactly as before, so the OAuth path this screen is really
 * about is untouched by a change to how it is browsed.
 *
 * ── WHY IT IS A CLIENT COMPONENT AT ALL ──────────────────────────────────────
 * Search and category are a view over data the server already sent. Routing them
 * through the URL would make every keystroke a round trip for a set of eight rows
 * that are already in the browser, which §23 rules out. React server components
 * can pass a rendered node across the boundary, so this costs the client the
 * filter state and nothing else.
 *
 * ── THE CATEGORY ROWS CARRY A GLYPH, AND THAT REVERSES A MEASUREMENT ─────────
 * They did not, and the reason was arithmetic rather than taste: seven glyphs cost
 * 2,612 bytes of first-load JavaScript and `/connections` was 698,061 bytes against
 * a recorded 691,660 with 8 kB of slack, so the glyphs took the route 0.8 kB past
 * the ceiling and lost to the search and the filter, which are the feature.
 *
 * What changed is HOW THEY ARE DRAWN, and the budget is why. Eleven `lucide-react`
 * imports were tried first and the build refused them again: MEASURED, 693.0 kB
 * against a 683.9 kB budget with 8 kB of slack, 1.1 kB past the ceiling, with the
 * same build minus the glyphs reporting `js-budget ok`. `kind-glyph.tsx` is the
 * shared sprite that paragraph said they would have to come back as — one `<svg>`
 * and a path per category rather than eleven components — and it lands the route
 * at 10.3 kB of route chunk, inside budget. The budget decided, twice; it was
 * never raised to fit what was added last.
 *
 * ── WHY THE ENTRANCE IS OPEN-CODED RATHER THAN `Stagger` ─────────────────────
 * `Stagger` keys its wrappers by INDEX, which is correct for a list that never
 * reorders and wrong for one that filters: position 0 would keep its DOM while
 * its child changed channel, so a `ConnectButton` that had just failed would
 * carry its error message onto a different platform's card. Keying by channel id
 * fixes the reconciliation and keeps `.enter-step`, the product's one entrance
 * (docs/37 §12) — survivors of a filter keep their DOM and do not re-animate,
 * and only genuinely new cards arrive.
 */

export interface MarketplaceItem extends Categorised {
  /** The catalogue id. The React key, so a filter cannot swap two cards' state. */
  id: string
  /** The card itself, rendered on the server. */
  tile: React.ReactNode
}

export interface MarketplaceSection {
  key: string
  name: string
  lead: string
  /** The tour anchor this group has always carried. */
  guide: string
  items: MarketplaceItem[]
}

export function ConnectionMarketplace({ sections }: { sections: MarketplaceSection[] }) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<string>(ALL_KINDS)

  const items = useMemo(() => sections.flatMap((section) => section.items), [sections])
  const facets = useMemo(() => kindFacets(items), [items])

  const visible = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => (kind === ALL_KINDS || item.kind === kind) && matchesQuery(item, query),
        ),
      })),
    [sections, kind, query],
  )

  const shown = visible.reduce((total, section) => total + section.items.length, 0)
  const filtering = query.trim().length > 0 || kind !== ALL_KINDS
  const kindLabel = facets.find((facet) => facet.id === kind)?.label ?? null

  const clear = () => {
    setQuery('')
    setKind(ALL_KINDS)
  }

  return (
    /* Column until `wide` (1180px), two columns above it. The rail is not merely
       narrowed on the way down: below 1180 it becomes a horizontal strip of the
       same controls, because a 200px column beside a two-column grid is what
       turns a 181px tile into a 172px one, and `connections-widths.spec.ts`
       exists because names die in exactly that band. Same DOM either way, so
       there is one set of controls in the accessibility tree, not two. */
    <div className="flex flex-col gap-4 wide:flex-row wide:items-start wide:gap-6">
      <nav
        aria-label="Connection types"
        className="min-w-0 wide:w-[212px] wide:shrink-0 wide:surface-ring wide:rounded-card wide:bg-surface wide:p-3"
      >
        <div className="hidden wide:mb-2 wide:block wide:px-2">
          <p className="type-h3">Connection types</p>
          <p className="type-sm mt-label-gap text-muted">Browse available connection categories.</p>
        </div>
        {/* `-mx-*` + matching padding so the first and last chip can sit flush
            with the content column while the scroll still has room to breathe at
            both ends. `overflow-x-auto` is scoped to this strip, so the page
            itself never scrolls sideways — the other half of the same bug. */}
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 wide:mx-0 wide:flex-col wide:gap-0.5 wide:overflow-visible wide:px-0 wide:pb-0">
          {facets.map((facet) => {
            const active = facet.id === kind
            return (
              <li key={facet.id} className="shrink-0 wide:shrink">
                <button
                  type="button"
                  aria-pressed={active}
                  /* The visible row is a label and a bare numeral with nothing
                     between them, which a screen reader reads as one word:
                     "Social feed4". The label repeats the visible text verbatim
                     and says what the number counts. */
                  aria-label={`${facet.label}, ${facet.count} ${facet.count === 1 ? 'channel' : 'channels'}`}
                  onClick={() => setKind(facet.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left type-sm transition-micro max-narrow:min-h-[44px]',
                    active ? 'bg-s2 text-ink' : 'text-muted hover:bg-s2 hover:text-ink',
                  )}
                >
                  {/* Decorative, and it must stay that way: the label beside it
                      carries the whole claim, and `aria-label` above already
                      reads the row out in full. A glyph that a screen reader
                      announced would make the row say its category twice. */}
                  {/* `text-ink` on the active row, NOT `text-accent`. MEASURED:
                      `--acc` is `#ff6600`, which is 2.94:1 on `--surface-2` —
                      under the 3:1 non-text floor, and the same figure that is
                      already an open finding against four `outline-accent` sites
                      in /admin. The glyph is decorative, so it is not strictly
                      held to that floor, but a mark nobody can see is not worth
                      the bytes. It follows the label, which the active row
                      already promotes to `text-ink`. */}
                  <KindGlyph
                    id={facet.id}
                    className={cn('transition-micro', active ? 'text-ink' : 'text-muted')}
                  />
                  <span className="wide:flex-1">{facet.label}</span>
                  {/* Tabular, because these sit in a column and a proportional
                      numeral makes a straight edge look bent. */}
                  <span className="num shrink-0 text-muted">{facet.count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 space-y-6">
        <div>
          <label htmlFor={searchId} className="sr-only">
            Search channels by name, category or what Sahoda does there
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search channels"
              autoComplete="off"
              /* 44px, which is the reference's proportion and also the minimum
                 comfortable tap target — this is the one control on the screen
                 a person reaches for first and it should not be the smallest. */
              className="h-11 pl-9"
            />
          </div>
          {/* Only while filtering, and it names both numbers. A bare "3" is a
              result; "3 of 8" is a result you can tell is a subset. */}
          {filtering ? (
            <p className="type-sm mt-2 text-muted" role="status" aria-live="polite">
              Showing <span className="num">{shown}</span> of{' '}
              <span className="num">{items.length}</span> channels.
            </p>
          ) : null}
        </div>

        {shown === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No channels match that"
            /* THE CLAIM IS ABOUT THE SEARCH, NEVER ABOUT SAHODA. "Sahoda has no
               channels" would be false; what happened is that these words matched
               none of the eight it has. The sentence says which words. */
            body={
              query.trim().length > 0
                ? kind === ALL_KINDS
                  ? `None of Sahoda’s ${items.length} channels matches “${query.trim()}”.`
                  : `Nothing under ${kindLabel} matches “${query.trim()}”.`
                : `Nothing is filed under ${kindLabel}.`
            }
            /* A remedy that works: the filter is client state, so clearing it
               genuinely puts every channel back. Secondary, because this screen
               spends its one accent on a broken connection (§1.5). */
            action={
              <Button variant="secondary" onClick={clear}>
                Clear search and filters
              </Button>
            }
          />
        ) : (
          visible.map((section) =>
            section.items.length === 0 ? null : (
              <section key={section.key} className="space-y-3" data-guide={section.guide}>
                <div className="space-y-1">
                  <h2 className="type-h2">{section.name}</h2>
                  <p className="type-sm text-muted">{section.lead}</p>
                </div>
                {/* Three columns only above 1360px. Between 1180 and 1360 the
                    rail is already taking 212px of the row, and a third column
                    there is what shrinks a tile below the width its own name
                    needs. Two wide cards beat three clipped ones. */}
                <div className="grid items-stretch gap-4 max-narrow:grid-cols-1 narrow:grid-cols-2 min-[1360px]:grid-cols-3">
                  {section.items.map((item, i) => (
                    <div
                      key={item.id}
                      className="enter-step h-full"
                      style={{ '--i': i } as React.CSSProperties}
                    >
                      {item.tile}
                    </div>
                  ))}
                </div>
              </section>
            ),
          )
        )}
      </div>
    </div>
  )
}
