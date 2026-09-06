import {
  ChannelSchema,
  ConnectionPlatformSchema,
  type Channel,
  type ConnectionPlatform,
} from '@sahoda/shared'

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
 * all of them `CHECK (… = ANY (ARRAY['x','gbp','linkedin','instagram']))` in the
 * APPLIED migrations, plus
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
 * Adding a `Channel` means a migration across all ten plus the five functions.
 *
 * ── AND THIS IS WHY EIGHT NEW PLATFORMS DID NOT TOUCH `Channel` ──────────────
 * `connections.platform` has a CHECK of its own, and widening THAT is one
 * constraint on one table rather than ten plus five functions. A connect-only
 * platform needs exactly that one and nothing else, because it never reaches
 * `post_variants`, `post_publish_logs` or any of the rest — it has no adapter to
 * put a row there. The narrow blast radius is a consequence of the separation,
 * not a coincidence.
 *
 * That constraint is a feature here, not an obstacle. A planned channel has no
 * adapter, so it can never hold a connection row, so it must never look
 * connectable — and a type that CANNOT be written to `connections.platform` is the
 * strongest available guarantee of that. `PlannedChannel` is therefore a
 * presentation-only union that is deliberately NOT assignable to `Channel`, and
 * `Channel` itself is still imported from @sahoda/shared and never redefined.
 */

/**
 * Channels the product NAMES and cannot even connect. Presentation only — nothing
 * in this list may reach the database, the composer or an adapter.
 *
 * ── THIS LIST EMPTIED OUT ON 2026-08-26, AND THAT IS A MEASUREMENT ───────────
 * It held `youtube` and `pinterest`, on the reasoning that neither could be given
 * an honest `PlatformSpec`: YouTube is video and the spec has no duration or
 * codec field, Pinterest needs a board id and `FormattedContent` has nowhere to
 * put one. **Both of those remain true and neither has been ignored.** What
 * changed is that the reasoning conflated two questions this file exists to keep
 * apart. A `PlatformSpec` is what PUBLISHING needs. Neither channel needs one to
 * be CONNECTED, and both answer `GET /v1/connect/{platform}` with a real
 * `authUrl` — MEASURED, one probe each, against a live profile.
 *
 * So they moved to `ConnectionPlatform` and stayed out of `Channel`, which is
 * exactly the gap those two enums were separated to hold. Their tiles say
 * "Connect only", and the composer cannot offer them because `CONSTRAINTS` is
 * keyed by `Channel`.
 *
 * SNAPCHAT is what is left, and it is here on evidence rather than intent:
 * `GET /v1/connect/snapchat` answers **403 `PLATFORM_BETA_RESTRICTED`**. Not a
 * gap in our product; a door Zernio has not opened. A tile that offered Connect
 * would be an impossible remedy.
 *
 * TELEGRAM is not here, and that is deliberate. It is a real `Channel` — the
 * publish adapter is the generic Zernio one and works — so it cannot live in a
 * union defined as "not assignable to Channel". What it cannot do is CONNECT
 * through the OAuth rail, and that is expressed where it belongs: it is absent
 * from `ZERNIO_PLATFORMS`, so its button is disabled with a reason.
 */
export const PLANNED_CHANNELS = ['snapchat'] as const
export type PlannedChannel = (typeof PLANNED_CHANNELS)[number]

/**
 * Every channel `/connections` names.
 *
 * `ConnectionPlatform`, not `Channel`. The screen's subject is what a customer
 * may LINK, and that set is now genuinely wider than what Sahoda may PUBLISH to:
 * fourteen against six. Typing this as `Channel` is what made eight connectable
 * platforms unrepresentable here.
 */
export type CatalogueChannel = ConnectionPlatform | PlannedChannel

/**
 * How real this channel's ability to publish is — the Certainty System applied to
 * the PRODUCT rather than to the customer's content.
 *
 *   publishes-today   `.is-real`       a live send has succeeded. It happened.
 *   built-not-proven  `.is-committed`  the adapter exists; no live send, ever.
 *   connect-only      `.is-proposed`   linking works; there is no adapter.
 *   not-built         `.is-proposed`   we cannot even link it.
 *
 * The last two share a class because this ladder ranks how real PUBLISHING is,
 * and for both of them the answer is "not at all". They are different rows on the
 * screen and carry different words, because what the reader can DO about them
 * differs completely: one has a working Connect button and the other must not.
 *
 * The three rungs are far apart on purpose (solid ▸ tint+hairline ▸ dashed), which
 * is the lesson `docs/27` §3.5 draws from `/create/post` being the best screen in
 * the app: a rung is only a signal when something else is on a different one.
 */
export type Readiness = 'publishes-today' | 'built-not-proven' | 'connect-only' | 'not-built'

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
    kind: 'Video',
    blurb: 'Link your channel so Sahoda can read it. Posting video is not built.',
    // CONNECT-ONLY, and the reason is unchanged from the day it was `not-built`:
    // `PlatformSpec` has `imageDims` and `aspectRange` and no duration, codec or
    // resolution field, and the media pipeline is image-shaped end to end. What
    // changed is that none of that stands between a customer and LINKING the
    // account. MEASURED: `GET /v1/connect/youtube` returns 200 with an authUrl.
    readiness: 'connect-only',
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    short: 'Pinterest',
    kind: 'Boards',
    blurb: 'Link your account so Sahoda can read it. Pinning is not built.',
    // CONNECT-ONLY. A pin needs a destination link and a BOARD id, and
    // `FormattedContent` has nowhere to carry a board — still true, still the
    // reason there is no adapter. Connecting needs neither.
    readiness: 'connect-only',
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
     * Shipping it on the OAuth rail gave a button that answered "Couldn't start
     * the connection. Try again." on every press: a retry that can never succeed,
     * which is the impossible remedy `no-impossible-remedy.spec` forbids. So
     * `ZERNIO_PLATFORMS` dropped it and the button disabled with a reason.
     *
     * ── BUILT 2026-08-27 ─────────────────────────────────────────────────────
     * The note here used to end "what building it needs: a code-and-poll surface
     * of its own", and that is now `api/oauth/zernio/telegram` plus
     * `components/connections/telegram-connect.tsx`. Telegram is back in
     * `ZERNIO_PLATFORMS` — which was always the wrong list to express "no
     * authUrl", since it governs whether a workspace may HOLD the connection and
     * the reconcile sweep needs membership to find the account at all. The OAuth
     * start route refuses it by name instead, via `needsPairingCode`.
     */
    readiness: 'built-not-proven',
  },

  /**
   * ── THE EIGHT CONNECT-ONLY PLATFORMS ────────────────────────────────────────
   * Every one of these was MEASURED on 2026-08-26, one probe each against
   * `GET /v1/connect/{platform}` with a live profile id. All eight answered
   * HTTP 200 carrying an `authUrl`, which is the whole of what connecting needs.
   *
   * None of them has a `PlatformSpec`, so none is a `Channel`, so the composer
   * cannot offer them and no figure about them is stated anywhere. That is the
   * honest position and it is enforced by the type system rather than by anyone
   * remembering: `CONSTRAINTS` is keyed by `Channel` and these ids are not in it.
   *
   * A blurb here describes what LINKING the account is for. It never promises a
   * post, because the tile beside it says "Connect only" and the two claims must
   * not contradict each other.
   */
  {
    id: 'tiktok',
    label: 'TikTok',
    short: 'TikTok',
    kind: 'Short video',
    blurb: 'Link your account so Sahoda can read it. Posting video is not built.',
    readiness: 'connect-only',
  },
  {
    id: 'threads',
    label: 'Threads',
    short: 'Threads',
    kind: 'Social feed',
    blurb: 'Link your Threads account. Posting is not built yet.',
    readiness: 'connect-only',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    short: 'WhatsApp',
    kind: 'Messaging',
    blurb: 'Link your WhatsApp business number. Sending is not built yet.',
    readiness: 'connect-only',
  },
  {
    id: 'discord',
    label: 'Discord',
    short: 'Discord',
    kind: 'Community',
    blurb: 'Link a server so Sahoda can read it. Posting is not built yet.',
    readiness: 'connect-only',
  },
  {
    id: 'slack',
    label: 'Slack',
    short: 'Slack',
    kind: 'Team chat',
    blurb: 'Link a workspace so Sahoda can read it. Posting is not built yet.',
    readiness: 'connect-only',
  },
  {
    id: 'reddit',
    label: 'Reddit',
    short: 'Reddit',
    kind: 'Community',
    blurb: 'Link your account so Sahoda can read it. Posting is not built yet.',
    readiness: 'connect-only',
  },

  /**
   * NOT CONNECTABLE, and the evidence is a status code rather than a plan.
   * `GET /v1/connect/snapchat` answers 403 `PLATFORM_BETA_RESTRICTED` — the only
   * platform we name that Zernio refuses outright. Its Connect button is disabled
   * with that as the reason, because offering one would be a remedy that cannot
   * work however many times it is pressed.
   */
  {
    id: 'snapchat',
    label: 'Snapchat',
    short: 'Snapchat',
    kind: 'Short video',
    blurb: 'Snapchat is not open to Sahoda yet.',
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

/**
 * The set the `connections` table will accept, taken from the schema.
 *
 * A separate question from `CHANNEL_SET` and now a genuinely different answer.
 * Restating either as a literal is how a channel gets typed into one list and
 * not the other.
 */
const PLATFORM_SET: ReadonlySet<string> = new Set<string>(ConnectionPlatformSchema.options)

/**
 * Narrow a catalogue id to a real `Channel` — one Sahoda can PUBLISH to.
 *
 * Connect-only platforms and planned ones both return null, for the same reason:
 * neither has a `PlatformSpec`, so neither can be given limits, a formatter or an
 * adapter. This is the guard that keeps eight newly connectable platforms out of
 * the composer without a single call site having to remember them.
 */
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
export const CONNECTABLE = CATALOGUE.filter((entry) => PLATFORM_SET.has(entry.id))

/** Channels named so the customer knows they exist, and nothing more. */
export const PLANNED = CATALOGUE.filter((entry) => !PLATFORM_SET.has(entry.id))

/**
 * Can Sahoda PUBLISH here, as opposed to merely link it?
 *
 * The one question the tile cannot answer from `readiness` alone, because
 * readiness is evidence about a capability and this is about whether the
 * capability exists at all. `asChannel` is the whole implementation: a
 * `PlatformSpec` is keyed by `Channel`, so a catalogue id that is not one has no
 * limits, no formatter and no adapter, and the composer cannot reach it.
 */
export function canPublish(id: CatalogueChannel): boolean {
  return asChannel(id) !== null
}

/**
 * Narrow a catalogue id to a `ConnectionPlatform` — one that can hold a row in
 * `connections`. Planned ids never pass.
 *
 * The counterpart to `asChannel`, and the distinction is the whole of this
 * change: `asChannel` gates the COMPOSER and this gates the CONNECT BUTTON. The
 * tile used to branch on `asChannel`, so the day eight connect-only platforms
 * arrived they would every one have rendered as an unbuilt card with no control
 * — connectable in the schema, in the route and in the plan gate, and refused by
 * the one component the customer actually presses.
 */
export function asPlatform(id: CatalogueChannel): ConnectionPlatform | null {
  return PLATFORM_SET.has(id) ? (id as ConnectionPlatform) : null
}

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
  'connect-only': 'is-proposed',
  'not-built': 'is-proposed',
}

/**
 * The words on the chip. Short, because the tile header is narrow, and each one is
 * a claim someone could check.
 *
 * ── REWRITTEN AS CAPABILITIES, 2026-09-06, WITH THE CLAIMS HELD FIXED ────────
 * "Publishes today" and "Not proven live" were the words an engineer uses about a
 * release, read by a shop owner deciding where to post. Each is now the thing the
 * customer can do, and each claim is exactly as narrow as it was (CLAUDE.md, copy
 * rule 1). The detail row in `details.ts` carries the full sentence beneath it.
 *
 * "Not yet confirmed live" rather than "Not verified live": nobody verifies
 * anything here. The claim is that no post has ever been confirmed to reach the
 * platform, which `post_publish_logs.mode = 'live'` is the only evidence for.
 */
export const READINESS_LABEL: Readonly<Record<Readiness, string>> = {
  'publishes-today': 'Ready to publish',
  'built-not-proven': 'Not yet confirmed live',
  // Says what IS true rather than what is missing. "No posting yet" describes a
  // hole; "Connect only" describes the thing the customer can actually do today,
  // and the tile's own line carries the limit underneath it.
  //
  // KEPT on evidence when the two above were rewritten. The proposed "Read-only
  // for now" would claim Sahoda READS these accounts, and `InboxPlatformSchema`
  // names only two of the eight (whatsapp, reddit); nothing in this codebase
  // reads TikTok, Threads, YouTube, Pinterest, Discord or Slack. A warmer label
  // that is true in two cases out of eight is the defect rule 1 forbids. And
  // "Connect" is already this screen's own verb, on every button under it.
  'connect-only': 'Connect only',
  'not-built': 'Coming soon',
}

/**
 * The offer rule lives in `./offer`, which has no imports.
 *
 * Re-exported here because every reader already asks the catalogue this
 * question and moving the import site would have been a wider change than the
 * one that made it necessary. Defined ONCE, in the module that can be imported
 * without the catalogue behind it — see `offer.ts` for the 807 bytes that
 * prompted the split.
 */
export { HIDDEN_FROM_OFFER, isOfferedForConnect } from './offer'
