/**
 * THE CATEGORY AXIS OF /connections, DERIVED AND NEVER TYPED OUT.
 *
 * ── WHY `kind` AND NOT A NEW LIST ────────────────────────────────────────────
 * The catalogue already carries the answer to "what sort of connection is this"
 * on every entry: `kind` — *Social feed*, *Local listing*, *Video platform*,
 * *Visual discovery*, *Broadcast*. It was written to answer "why is Google
 * Business Profile in with Instagram" on the tile itself. A sidebar that filters
 * by it is the same claim promoted to navigation, so there is exactly one place a
 * category can be added or renamed: the catalogue row.
 *
 * A second hand-written list of categories would be a fifth channel typed into
 * one place and not the other, which is the failure `CHANNEL_SET` exists to stop
 * on the schema side. So nothing here is a literal: the facets, their order and
 * their counts all fall out of the entries handed in.
 *
 * ── WHY THIS IS NOT THE GROUPING OF THE PAGE ─────────────────────────────────
 * The page still GROUPS by readiness — what Sahoda can publish to today versus
 * what it cannot. `docs/27_Design_Audit.md` §3.4 measured what happens when a
 * heading owns one card: "two rows of cards, then ~400px of dead space". Four of
 * the five kinds hold exactly one channel, so kind is a fine FILTER and would be
 * a bad set of headings. Filtering to one card is a result; heading one card is a
 * paperweight.
 */

/** The facet that means "do not filter". Not a kind; no catalogue row may use it. */
export const ALL_KINDS = 'all'

/** The least an entry must carry to be filed and searched. */
export interface Categorised {
  label: string
  kind: string
  blurb: string
}

export interface KindFacet {
  /** `ALL_KINDS`, or the catalogue's own `kind` string. */
  id: string
  label: string
  count: number
}

/**
 * Every category present in `entries`, in first-appearance order, each with its
 * real count, preceded by All.
 *
 * COUNTS ARE COMPUTED, NEVER STORED. A hardcoded count is a number that looks
 * like a measurement and is a memory of one; this repository has already shipped
 * three of those on screens and one in its own CLAUDE.md.
 */
export function kindFacets(entries: readonly Categorised[]): KindFacet[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1)
  }
  return [
    { id: ALL_KINDS, label: 'All', count: entries.length },
    ...Array.from(counts, ([label, count]) => ({ id: label, label, count })),
  ]
}

/**
 * Does this entry answer `query`?
 *
 * Every whitespace-separated token must appear somewhere in the name, the
 * sentence or the category — so "social x" narrows rather than widens, and typing
 * a category name finds its channels even though the category is not part of the
 * channel's name. Matching is case-insensitive and substring-based: a person
 * typing "insta" has not finished the word and should not be punished for it.
 *
 * An empty or whitespace-only query matches everything. It is not a search that
 * found nothing; it is no search at all, and the difference is the whole of
 * §14's empty state.
 */
export function matchesQuery(entry: Categorised, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = `${entry.label} ${entry.blurb} ${entry.kind}`.toLowerCase()
  return tokens.every((token) => haystack.includes(token))
}
