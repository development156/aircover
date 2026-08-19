import { ChannelSchema, type Channel } from '@sahoda/shared'

/**
 * WHAT SAHODA CAN PUBLISH TO, AND HOW REAL EACH ANSWER IS.
 *
 * ── THE ONE IDEA ─────────────────────────────────────────────────────────────
 * `/connections` answers two different questions and they were being rendered in
 * one slot with two vocabularies (`docs/27_Design_Audit.md` §3.3 — Instagram and
 * LinkedIn said "Available" in plain grey text while X and GBP said "Not verified
 * live" in a hairline chip, so the LESS important status got the STRONGER
 * treatment). They are not the same claim:
 *
 *   READINESS   — can SAHODA publish here at all?      a claim about the product
 *   CONNECTION  — is THIS WORKSPACE's account linked?  a claim about the customer
 *
 * This file owns the first. `lib/connections/health.ts` owns the second. Keeping
 * them apart is the same move `docs/26_Design_System_v4.md` §3.3 makes for post
 * status: when one rung has to carry two meanings, add a second structural axis
 * rather than weaken the rung.
 *
 * ── WHY A PLANNED CHANNEL IS NOT A `Channel` ─────────────────────────────────
 * `ChannelSchema` is not a wish list. It is mirrored by a Postgres CHECK
 * constraint on SEVEN tables — verified against production on 2026-08-19:
 *
 *   connections · post_variants · post_publish_logs · inbox_threads
 *   post_metric_snapshots · asset_usages · templates
 *
 * all of them `CHECK (… = ANY (ARRAY['x','gbp','linkedin','instagram']))`. Adding
 * facebook to that union means a migration across all seven, and only wt-db edits
 * migrations (root `CLAUDE.md`).
 *
 * That constraint is a feature here, not an obstacle. A planned channel has no
 * adapter, so it can never hold a connection row, so it must never look
 * connectable — and a type that CANNOT be written to `connections.platform` is the
 * strongest available guarantee of that. `PlannedChannel` is therefore a
 * presentation-only union that is deliberately NOT assignable to `Channel`, and
 * `Channel` itself is still imported from @sahoda/shared and never redefined.
 */

/**
 * Channels the product will offer and has not built. Presentation only — nothing
 * in this list may reach the database, the composer or an adapter.
 */
export const PLANNED_CHANNELS = ['facebook', 'youtube', 'pinterest', 'telegram'] as const
export type PlannedChannel = (typeof PLANNED_CHANNELS)[number]

/** Every channel `/connections` names, built or planned. */
export type CatalogueChannel = Channel | PlannedChannel

/**
 * How real this channel's ability to publish is — the Certainty System applied to
 * the PRODUCT rather than to the customer's content.
 *
 *   publishes-today   `.is-real`       a live send has succeeded. It happened.
 *   built-not-proven  `.is-committed`  the adapter exists; no live send, ever.
 *   not-built         `.is-proposed`   there is no adapter. Coming soon.
 *
 * The three rungs are far apart on purpose (solid ▸ tint+hairline ▸ dashed), which
 * is the lesson `docs/27` §3.5 draws from `/create/post` being the best screen in
 * the app: a rung is only a signal when something else is on a different one.
 */
export type Readiness = 'publishes-today' | 'built-not-proven' | 'not-built'

export interface CatalogueEntry {
  id: CatalogueChannel
  /** The name a person recognises. Never an internal id. */
  label: string
  /** Short form, for the ~14 characters a narrow tile header has. */
  short: string
  /** What this channel DOES for the business — answers "why is GBP in this list". */
  kind: string
  readiness: Readiness
}

/**
 * ── EVERY READINESS MARK BELOW IS EVIDENCE, NOT INTENT ───────────────────────
 * MEASURED 2026-08-19 against production, read-only, from `post_publish_logs`
 * grouped by `(channel, mode, status)`:
 *
 *   | channel   | live succeeded | live failed | fixture succeeded |
 *   |-----------|----------------|-------------|-------------------|
 *   | instagram | 6              | 5           | 1                 |
 *   | linkedin  | 1              | 1           | 1                 |
 *   | x         | 0              | 0           | 3                 |
 *   | gbp       | 0              | 0           | 2                 |
 *
 * Corroborated by `post_variants`: instagram holds 6 permalinks that are not
 * `fixture://` and linkedin 1, while every X and GBP permalink is a fixture one.
 * So X and GBP have a `publish_status = 'published'` row and have NEVER reached
 * the platform — which is exactly why readiness may not be read off
 * `publish_status`, and why the counter behind the X ration counts
 * `post_publish_logs` rows with `mode = 'live'` instead (`x-usage.ts`).
 *
 * MOVE AN ENTRY UP THE DAY THE EVIDENCE CHANGES, not the day the code lands. This
 * is a claim about what has happened, and re-running the query above is how it is
 * re-earned.
 */
export const CATALOGUE: readonly CatalogueEntry[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    short: 'Instagram',
    kind: 'Feed',
    readiness: 'publishes-today',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    short: 'LinkedIn',
    kind: 'Feed',
    readiness: 'publishes-today',
  },
  { id: 'x', label: 'X', short: 'X', kind: 'Feed', readiness: 'built-not-proven' },
  {
    id: 'gbp',
    label: 'Google Business Profile',
    short: 'Google Business',
    kind: 'Local listing',
    readiness: 'built-not-proven',
  },
  {
    id: 'facebook',
    label: 'Facebook Pages',
    short: 'Facebook',
    kind: 'Feed',
    readiness: 'not-built',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    short: 'YouTube',
    kind: 'Short video',
    readiness: 'not-built',
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    short: 'Pinterest',
    kind: 'Boards',
    readiness: 'not-built',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    short: 'Telegram',
    kind: 'Broadcast',
    readiness: 'not-built',
  },
]

/**
 * The set the DATABASE will accept, taken from the schema rather than restated.
 *
 * Restating it as a literal is how a fifth channel would get typed into one list
 * and not the other; `ChannelSchema.options` cannot drift from the enum it is.
 */
const CHANNEL_SET: ReadonlySet<string> = new Set<string>(ChannelSchema.options)

/** Narrow a catalogue id to a real `Channel`. Planned ids never pass. */
export function asChannel(id: CatalogueChannel): Channel | null {
  return CHANNEL_SET.has(id) ? (id as Channel) : null
}

/**
 * Channels a customer may attempt to connect: every real `Channel`, in catalogue
 * order.
 *
 * Derived by FILTERING the catalogue through the schema rather than by reading
 * `readiness`, and the difference matters. `built-not-proven` is a statement about
 * evidence that will change the first time X publishes; connectability is a
 * statement about whether an adapter and a `connections` row can exist at all. Ties
 * one to the other and the day X is proven, the tile silently changes category.
 */
export const CONNECTABLE = CATALOGUE.filter((entry) => asChannel(entry.id) !== null)

/** Channels named so the customer knows they are coming, and nothing more. */
export const PLANNED = CATALOGUE.filter((entry) => asChannel(entry.id) === null)

/** Catalogue lookup by id. */
export const ENTRY: Readonly<Record<CatalogueChannel, CatalogueEntry>> = Object.fromEntries(
  CATALOGUE.map((entry) => [entry.id, entry]),
) as Record<CatalogueChannel, CatalogueEntry>

/**
 * The certainty class a readiness rung wears.
 *
 * `.is-simulated` is deliberately absent. It means "a fixture ran", which is true
 * of X and GBP — but it is a claim about ONE RESULT, and the hatch belongs beside
 * the fixture output on `/posts`, not on a channel tile that is describing a
 * capability. `built-not-proven` is the capability-shaped version of the same
 * honesty.
 */
export const READINESS_CLASS: Readonly<Record<Readiness, string>> = {
  'publishes-today': 'is-real',
  'built-not-proven': 'is-committed',
  'not-built': 'is-proposed',
}

/**
 * The words on the chip. Short, because the tile header is narrow, and each one is
 * a claim someone could check.
 *
 * "Not proven live" rather than "Not verified live": nobody verifies anything here.
 * The claim is that no publish has ever been proven to reach the platform.
 */
export const READINESS_LABEL: Readonly<Record<Readiness, string>> = {
  'publishes-today': 'Publishes today',
  'built-not-proven': 'Not proven live',
  'not-built': 'Coming soon',
}
