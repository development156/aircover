import { BrandMemoryPayloadSchema, type BrandMemoryPayload } from '@sahoda/shared'
import type { SeedModule, SeedTableResult } from './context'
import { at } from './time'

/**
 * Two brand_memory versions so the Brand Brain opens on a history, not a single row:
 * v1 is the machine resolve off a thin intake, v2 is the owner's rewrite. The demo's
 * whole point is that the second one reads like a person who runs the shop.
 */

/** The first resolve. Correct, but it could be any café in any town. */
const V1_PAYLOAD: BrandMemoryPayload = {
  voice: {
    descriptor: 'Warm and welcoming, written for people who like to sit and read.',
    formality_label: 'Casual-professional',
    signature_phrases: ['Pull up a chair', 'Good books, good coffee', 'Open till late'],
    banned_phrases: ['unbeatable prices', 'best in town', 'limited time only'],
  },
  brand_persona: {
    archetype: 'The Everyman',
    one_liner: 'A neighbourhood bookshop and café where readers can stay as long as they like.',
    core_values: ['reading', 'hospitality', 'community'],
  },
  customer_persona: {
    one_liner: 'Local readers and students looking for a quiet place to sit.',
    primary_pain_point: 'Few places nearby stay open long enough for unhurried reading.',
    primary_fear: 'Paying café prices and being asked to leave after one cup.',
    desired_identity: 'Someone who reads regularly and has a place that knows them.',
  },
  hook: {
    core_promise: 'A seat, a book, and a coffee that lasts.',
    primary_emotion: 'calm',
    sample_hooks: [
      'Stay as long as the book does.',
      'New titles arrived this week.',
      'The coffee is on and the shelves are full.',
    ],
  },
  taboo: {
    red_lines: [
      'No discount language on new titles',
      'No comparisons with other bookshops',
      'No politics and no religious commentary',
    ],
  },
  alignment: {
    signal_lock: 'moderate',
    note:
      'Signals were thin. The intake gave a name, a category and one mission line, with no tone ' +
      'samples, no customer notes and no proof points, so voice and customer persona are ' +
      'inferred from the category rather than observed. Add two or three lines you actually say ' +
      'across the counter to lift this to strong.',
  },
}

/** The owner's rewrite. Same shop, said properly. */
const V2_PAYLOAD: BrandMemoryPayload = {
  voice: {
    descriptor:
      'Plain and warm, the way a shopkeeper talks across the counter. Odia words stay in ' +
      'where they belong, and nothing is oversold.',
    formality_label: 'First-name friendly, never salesy',
    signature_phrases: [
      'Read a chapter before you buy',
      'Saturday, 5pm, upstairs',
      'Odia shelf first, then English',
    ],
    banned_phrases: [
      'hidden gem',
      'must-visit',
      'best coffee in Cuttack',
      'curated experience',
      'literary destination',
      'grab yours now',
    ],
  },
  brand_persona: {
    archetype: 'The Sage, keeping shop',
    // No filter coffee anywhere in v2: this row is written at(-14) while
    // posts.filter-coffee-launch is still SCHEDULED for at(+2). A brain that already
    // describes the launch as standing would date itself two weeks after its own row.
    one_liner:
      'A two-room bookshop off a Buxi Bazaar side street where Odia poetry sits at eye level ' +
      'and the reading room upstairs is never rushed.',
    core_values: [
      'Odia writing gets the front shelf',
      'A seat costs nothing',
      'We only recommend what we have read',
    ],
  },
  customer_persona: {
    one_liner:
      'Cuttack readers aged 20 to 45: Ravenshaw students, school teachers, and people who grew ' +
      'up on Odia poetry and now mostly buy English fiction.',
    primary_pain_point:
      'Odia titles are hard to find in the city and the online sellers do not stock them at all.',
    primary_fear: 'That the last of the old bookshops closes and reading becomes a screen habit.',
    desired_identity:
      'A reader who still buys Odia books, at a shop where the owner remembers what they ' +
      'finished last.',
  },
  hook: {
    core_promise:
      'Odia and English on the same shelf, a chair that is yours for the afternoon, and chai ' +
      'that keeps coming.',
    primary_emotion: 'belonging',
    sample_hooks: [
      'Three Odia poets we shelved this week.',
      'Book club, Saturday 5pm, upstairs. Bring your copy or borrow ours.',
      'Pakhala from May. Same seat, cooler lunch.',
    ],
  },
  taboo: {
    red_lines: [
      'No discount language on new Odia titles. The publishers are small and the print runs short',
      'Never name another Cuttack bookshop or café in a comparison',
      'No festival post that turns Raja Parba or Bali Jatra into a sale hook',
      'No politics and no religious commentary, even when a book invites it',
      'Never promise stock we have not counted on the shelf',
    ],
  },
  alignment: {
    signal_lock: 'strong',
    note:
      'Owner rewrote voice, customer and hook because the first draft read like any café. ' +
      'Now grounded in what the shop actually does: Odia and English stock side by side, the ' +
      'Saturday club upstairs, unhurried chai, and pakhala through the summer. The intake, the ' +
      'shelf list and three months of counter conversation agree.',
  },
}

/**
 * memory_events.diff has no shared zod schema yet (the row schema types it as plain
 * jsonb), so the writeback shape is pinned here: a summary the reviewer reads first,
 * the reason it was raised, and path-addressed replacements. Every change is a REPLACE
 * because the three fixed-length lists are exactly 3 entries under the frozen contract;
 * an "add" proposal could never be applied.
 */
interface MemoryDiff {
  readonly summary: string
  readonly rationale: string
  readonly changes: readonly { readonly path: string; readonly from: string; readonly to: string }[]
}

/**
 * noUncheckedIndexedAccess types the fixed-length payload lists as `string | undefined`.
 * The diffs quote real entries by index, so a bad index must fail the seed here rather
 * than ship a `from` of null that no reviewer could match against the live brain.
 */
function entry(list: readonly string[], index: number): string {
  const value = list[index]
  if (value === undefined) throw new Error(`brand payload list has no entry at ${index}`)
  return value
}

/** Landed in v2, so its `from`/`to` are read off the two payloads instead of retyped. */
const ODIA_POETRY_DIFF: MemoryDiff = {
  summary: 'Put Odia writing at the centre of the brain, not in the general "reading" value',
  rationale:
    'Posts about Odia poetry drew far more replies and shop visits than the general reading ' +
    'posts, and three customers asked whether we stock Odia titles at all. The brain said ' +
    'nothing about it, so the drafts kept coming back generic.',
  changes: [
    {
      path: 'brand_persona.core_values[0]',
      from: entry(V1_PAYLOAD.brand_persona.core_values, 0),
      to: entry(V2_PAYLOAD.brand_persona.core_values, 0),
    },
    {
      path: 'customer_persona.primary_pain_point',
      from: V1_PAYLOAD.customer_persona.primary_pain_point,
      to: V2_PAYLOAD.customer_persona.primary_pain_point,
    },
    {
      path: 'hook.sample_hooks[0]',
      from: entry(V1_PAYLOAD.hook.sample_hooks, 0),
      to: entry(V2_PAYLOAD.hook.sample_hooks, 0),
    },
  ],
}

/** Still pending: proposed against v2, waiting on the owner in the review UI. */
const PAKHALA_HOURS_DIFF: MemoryDiff = {
  summary: 'Lead with the hours and the summer menu instead of closing on them',
  rationale:
    'The posts that named the summer hours and the pakhala window were saved roughly three ' +
    'times as often as the ones that only listed books. Readers are saving the post to know ' +
    'when to come, so the practical line should open the caption rather than end it.',
  changes: [
    {
      path: 'voice.descriptor',
      from: V2_PAYLOAD.voice.descriptor,
      to:
        `${V2_PAYLOAD.voice.descriptor} Opening hours and the day's food go in the ` +
        'first line, not the last.',
    },
    {
      path: 'hook.sample_hooks[2]',
      from: entry(V2_PAYLOAD.hook.sample_hooks, 2),
      to: 'Pakhala till 3, books till 9. Summer hours start Monday.',
    },
  ],
}

/**
 * `status` is written explicitly on the update branch, never left to whatever a previous
 * run stored: brand_memory_one_active is a partial unique index, so a re-run that skipped
 * the supersede would leave two active rows and break every read of "the current brain".
 * `updated_at` is set by the set_updated_at BEFORE UPDATE trigger, so it is never listed.
 */
const BRAND_MEMORY_SQL = `insert into brand_memory
    (id, workspace_id, version, status, payload, source, created_by, created_at)
  values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
  on conflict (id) do update set
    workspace_id = excluded.workspace_id, version = excluded.version,
    status = excluded.status, payload = excluded.payload, source = excluded.source,
    created_by = excluded.created_by, created_at = excluded.created_at`

const MEMORY_EVENT_SQL = `insert into memory_events
    (id, workspace_id, source, diff, status, evidence_refs, applied_memory_version,
     resolved_at, created_at)
  values ($1, $2, 'insight', $3::jsonb, $4, $5::jsonb, $6, $7, $8)
  on conflict (id) do update set
    workspace_id = excluded.workspace_id, source = excluded.source, diff = excluded.diff,
    status = excluded.status, evidence_refs = excluded.evidence_refs,
    applied_memory_version = excluded.applied_memory_version,
    resolved_at = excluded.resolved_at, created_at = excluded.created_at`

export const seedBrand: SeedModule = async (ctx): Promise<readonly SeedTableResult[]> => {
  const v2CreatedAt = at(ctx.now, -14, '10:05')

  // v1 is listed first and is never 'active': inserting the active row second means the
  // partial unique index is only ever asked to hold one active row, on any run.
  const versions = [
    ['brand.v1', 1, 'superseded', 'resolved', V1_PAYLOAD, at(ctx.now, -21, '16:20')],
    ['brand.v2', 2, 'active', 'manual', V2_PAYLOAD, v2CreatedAt],
  ] as const

  for (const [label, version, status, source, payload, createdAt] of versions) {
    // Parse before insert so contract drift in @sahoda/shared fails the seed loudly
    // rather than persisting a brain the app cannot read back.
    const payloadJson = JSON.stringify(BrandMemoryPayloadSchema.parse(payload))
    await ctx.sql(BRAND_MEMORY_SQL, [
      ctx.id(label),
      ctx.workspaceId,
      version,
      status,
      payloadJson,
      source,
      ctx.ownerId,
      createdAt,
    ])
  }

  // posts.ts owns the post ids, so evidence names posts by their frozen label tail. The
  // review UI resolves the label; a uuid guessed from here would dangle.
  const events = [
    {
      label: 'memory-event.odia-poetry-demand',
      status: 'accepted',
      diff: ODIA_POETRY_DIFF,
      evidence: { posts: ['new-arrival-odia-poetry'], metric: 'replies', observed: '3x median' },
      appliedVersion: 2,
      // resolved exactly when v2 was written, because this event IS that edit
      resolvedAt: v2CreatedAt,
      createdAt: at(ctx.now, -16, '19:15'),
    },
    {
      label: 'memory-event.pakhala-hours',
      status: 'pending',
      diff: PAKHALA_HOURS_DIFF,
      evidence: { posts: ['monsoon-reading-list'], metric: 'saves', observed: '3x median' },
      appliedVersion: null,
      resolvedAt: null,
      createdAt: at(ctx.now, -4, '07:40'),
    },
  ] as const

  for (const event of events) {
    await ctx.sql(MEMORY_EVENT_SQL, [
      ctx.id(event.label),
      ctx.workspaceId,
      JSON.stringify(event.diff),
      event.status,
      JSON.stringify(event.evidence),
      event.appliedVersion,
      event.resolvedAt,
      event.createdAt,
    ])
  }

  ctx.log('brand: 2 memory versions (v2 active), 2 writeback events (1 pending)')

  return [
    { table: 'brand_memory', rows: 2 },
    { table: 'memory_events', rows: 2 },
  ]
}
