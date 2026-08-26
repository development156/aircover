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
 * constraint on TEN tables, RE-MEASURED against the migrations on 2026-08-26:
 *
 *   connections · post_variants · post_publish_logs · inbox_threads
 *   post_metric_snapshots · asset_usages · templates
 *   loop_channel_autonomy · audience_snapshots · remix_derivatives
 *
 * all of them `CHECK (… = ANY (ARRAY['x','gbp','linkedin','instagram']))`, plus
 * `app.is_channel_set(text[])` which carries the same literal for `loop_briefs`
 * and `playbook_run_items`, and four PL/pgSQL guards with the list inline
 * (`upsert_connection`, `upsert_zernio_connection`,
 * `assert_account_for_scheduled_post`, `publish_claim`).
 *
 * ── THIS COUNT WAS WRONG FOR SIX DAYS AND NOTHING SAID SO ────────────────────
 * It read SEVEN, verified 2026-08-19, and three migrations landed on the 20th and
 * 21st that each added a table nobody came back to add here. A stale inventory is
 * the exact failure mode that ships a channel which passes typecheck and then
 * violates a CHECK constraint on `remix_derivatives` in production, because the
 * whole cost model for adding a channel is "know every place the vocabulary is
 * written down". Re-run the grep, do not trust this paragraph:
 *
 *   grep -rn "'gbp'" packages/db/supabase/migrations | grep -i check
 *
 * Adding facebook means a migration across all ten plus the five functions, and
 * only wt-db edits applied migrations (root `CLAUDE.md`).
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
 *
 * ── FACEBOOK AND TELEGRAM LEFT THIS LIST ON 2026-08-26 ───────────────────────
 * They are now real `Channel` values, carried by the migration that widened the
 * CHECK constraint on ten tables. YouTube and Pinterest stay, and the reason is
 * not effort — it is that neither can be given an honest `PlatformSpec`:
 *
 *   youtube    is VIDEO. `PlatformSpec` has `imageDims` and `aspectRange` and no
 *              duration, codec or resolution field, and the media pipeline is
 *              image-shaped end to end.
 *   pinterest  needs a destination link and a BOARD id, and `FormattedContent`
 *              has nowhere to carry a board.

 * TELEGRAM is not here, and that is deliberate rather than an omission. It IS a
 * real `Channel` — the publish adapter is the generic Zernio one and works — so
 * it cannot live in a union defined as "not assignable to Channel". What it
 * cannot do is CONNECT through the OAuth rail, and that is expressed where it
 * belongs: `ZERNIO_PLATFORMS` no longer lists it, so its button is disabled with
 * a reason. See its catalogue entry below.
 *
 * Shipping either would mean writing limits no engine enforces, which is exactly
 * the fabricated figure the Constraint Engine exists to prevent.
 */
export const PLANNED_CHANNELS = ['youtube', 'pinterest'] as const
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
  /**
   * One sentence naming what Sahoda does with this channel, for the reader who
   * does not already know what "Local listing" buys them.
   *
   * Present tense on a CONNECTABLE channel is a claim we can keep. On a PLANNED
   * one it describes the intent, and the tile carries "Coming soon" plus its own
   * "Sahoda can't post here yet" line so the sentence can never be read as an
   * offer — the blurb says what the channel is for, the card says whether we can
   * do it yet, and those are different claims kept in different places.
   */
  blurb: string
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
    kind: 'Social feed',
    blurb: 'Publish posts, reels and stories directly to Instagram.',
    readiness: 'publishes-today',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    short: 'LinkedIn',
    kind: 'Social feed',
    blurb: 'Share content and engage with your professional network.',
    readiness: 'publishes-today',
  },
  {
    id: 'x',
    label: 'X',
    short: 'X',
    kind: 'Social feed',
    blurb: 'Post updates and grow your presence on X.',
    readiness: 'built-not-proven',
  },
  {
    id: 'gbp',
    label: 'Google Business Profile',
    short: 'Google Business',
    kind: 'Local listing',
    blurb: 'Manage your business profile and local presence.',
    readiness: 'built-not-proven',
  },
  {
    id: 'facebook',
    label: 'Facebook Pages',
    short: 'Facebook',
    kind: 'Social feed',
    blurb: 'Publish and manage your Facebook presence.',
    // BUILT 2026-08-26 and NOT YET PROVEN. The adapter is the generic Zernio one
    // — `createZernioAdapter(channel, deps)` — so no per-platform publish code
    // was written; what changed is the schema, the spec and the catalogue.
    // Nothing has been published to a real Facebook page from Sahoda, so this
    // stays on the middle rung until a live send succeeds. Move it the day the
    // evidence changes, not the day the code lands.
    readiness: 'built-not-proven',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    short: 'YouTube',
    kind: 'Video platform',
    blurb: 'Upload, manage and grow your YouTube channel.',
    readiness: 'not-built',
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    short: 'Pinterest',
    kind: 'Visual discovery',
    blurb: 'Share pins and reach more people on Pinterest.',
    readiness: 'not-built',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    short: 'Telegram',
    kind: 'Broadcast',
    blurb: 'Broadcast updates and engage with your Telegram community.',
    /**
     * PUBLISHING IS BUILT. CONNECTING IS NOT, AND THOSE ARE DIFFERENT CLAIMS —
     * which is the whole reason this file keeps readiness and connectability
     * apart in the first place.
     *
     * The adapter is the generic Zernio one, so a Telegram post would send. But
     * MEASURED against the spec, `GET /v1/connect/telegram` does NOT return an
     * `authUrl`: it returns an access CODE valid 15 minutes. The customer adds
     * Zernio's bot as an admin of their channel, sends the bot that code plus
     * their @channel, and the app polls `PATCH /v1/connect/telegram` until it
     * lands. No consent screen, no popup, no return trip — the entire shape every
     * other channel on this screen uses.
     *
     * Shipping it on the OAuth rail anyway gave a button that answered "Couldn't
     * start the connection. Try again." on every press: a retry that can never
     * succeed, which is the impossible remedy `no-impossible-remedy.spec` forbids.
     * So `ZERNIO_PLATFORMS` drops it and the button disables with a reason,
     * rather than the readiness rung being bent to carry a fact about connecting.
     *
     * What building it needs, so nobody rediscovers this: a code-and-poll surface
     * of its own.
     */
    readiness: 'built-not-proven',
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
