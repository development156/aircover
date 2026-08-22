import type { RadarStore } from './port'
import type { Competitor, RadarSnapshot, Snapshot } from './types'

/**
 * A RADAR THAT HAS SEEN THINGS — for tests, and for looking at the screen.
 *
 * ── THIS IS DOUBLE-LOCKED AND THE LOCK IS TESTED ─────────────────────────────
 * Fixture data on a customer's Radar would be the single worst defect this
 * product could ship: invented claims about named businesses, indistinguishable
 * from readings. So `fixtureStoreIfAllowed` refuses on TWO independent
 * conditions — a production `NODE_ENV`, and the absence of an explicit opt-in
 * env var — and `fixtures.test.ts` asserts the production refusal by setting
 * `NODE_ENV=production` and watching it return null with the flag ON.
 *
 * One condition would not be enough. `RADAR_FIXTURES` alone trusts deployment
 * configuration, and a variable set once in a preview environment outlives the
 * reason it was set. `NODE_ENV` alone would light fixtures up in every
 * developer's browser whether they asked or not.
 *
 * ── THE NAMES ARE OBVIOUSLY NOT REAL, ON PURPOSE ─────────────────────────────
 * "Sunrise Bakery" and "Corner Coffee Co." are the brief's own example and a
 * plain descriptor. A fixture named after an actual competitor of an actual
 * customer is how a screenshot becomes a claim.
 */

const WORKSPACE_BAKERY = 'Golden Crust'

function snapshot(id: string, competitorId: string, observedAt: string, source: string): Snapshot {
  return { id, competitorId, observedAt, source }
}

/** Two reads of Sunrise's site a week apart — the before and after of the combo. */
const SUN_BEFORE = snapshot(
  'snap-sun-0812',
  'comp-sunrise',
  '2026-08-12T04:10:00.000Z',
  'https://example.com/sunrise-bakery/offers',
)
const SUN_AFTER = snapshot(
  'snap-sun-0819',
  'comp-sunrise',
  '2026-08-19T04:08:00.000Z',
  'https://example.com/sunrise-bakery/offers',
)
const SUN_FEED = snapshot(
  'snap-sun-0821-feed',
  'comp-sunrise',
  '2026-08-21T04:12:00.000Z',
  'https://example.com/sunrise-bakery/posts',
)
const CORNER_MENU = snapshot(
  'snap-corner-0821',
  'comp-corner',
  '2026-08-21T04:15:00.000Z',
  'https://example.com/corner-coffee/menu',
)

const COMPETITORS: readonly Competitor[] = [
  {
    id: 'comp-sunrise',
    name: 'Sunrise Bakery',
    url: 'https://example.com/sunrise-bakery',
    kind: 'website',
    addedOn: '2026-07-30',
    lastObservedAt: SUN_FEED.observedAt,
  },
  {
    id: 'comp-corner',
    name: 'Corner Coffee Co.',
    url: 'https://example.com/corner-coffee',
    kind: 'google_business',
    addedOn: '2026-08-04',
    lastObservedAt: CORNER_MENU.observedAt,
  },
  {
    id: 'comp-mill',
    name: 'The Mill House',
    url: 'https://example.com/mill-house',
    kind: 'instagram',
    addedOn: '2026-08-18',
    // Never successfully read. The watch list must say so rather than showing a
    // dash that reads as "nothing has happened there".
    lastObservedAt: null,
  },
]

export const FIXTURE_SNAPSHOT: RadarSnapshot = {
  collector: 'reading',
  competitors: COMPETITORS,
  days: [
    {
      date: '2026-08-21',
      attempts: [
        {
          competitorId: 'comp-sunrise',
          attemptedOn: '2026-08-21',
          outcome: 'observed',
          note: null,
        },
        { competitorId: 'comp-corner', attemptedOn: '2026-08-21', outcome: 'observed', note: null },
        {
          competitorId: 'comp-mill',
          attemptedOn: '2026-08-21',
          outcome: 'unreachable',
          note: 'The page did not respond.',
        },
      ],
      changes: [
        {
          id: 'chg-sun-weekend',
          competitorId: 'comp-sunrise',
          competitorName: 'Sunrise Bakery',
          kind: 'cadence_shift',
          observedOn: '2026-08-21',
          evidence: [SUN_BEFORE, SUN_AFTER, SUN_FEED],
          observation: {
            // No digits in the prose. The counts live in `figures`, each with a
            // snapshot behind it, which is what lets them render at all.
            summary: 'Weekend combo posts appeared, where earlier reads found none.',
            figures: [
              {
                label: 'Weekend offer posts this month',
                value: 4,
                unit: 'posts',
                snapshotId: SUN_FEED.id,
              },
              {
                label: 'In the month before',
                value: 0,
                unit: 'posts',
                snapshotId: SUN_BEFORE.id,
              },
            ],
          },
          reading: {
            text:
              'This looks like a push on weekend footfall. Your brain says you compete on ' +
              'same-day freshness, so the answer is what a weekend combo cannot copy — ' +
              'not a cheaper combo.',
            brandBasis: { field: 'Positioning', value: 'Same-day freshness, never day-old' },
          },
        },
        {
          id: 'chg-corner-price',
          competitorId: 'comp-corner',
          competitorName: 'Corner Coffee Co.',
          kind: 'price_changed',
          observedOn: '2026-08-21',
          evidence: [CORNER_MENU],
          observation: {
            summary: 'The listed price for a filter coffee changed on their menu page.',
            figures: [{ label: 'Listed price', value: 120, unit: '₹', snapshotId: CORNER_MENU.id }],
          },
          reading: null,
        },
      ],
    },
    {
      date: '2026-08-19',
      attempts: [
        {
          competitorId: 'comp-sunrise',
          attemptedOn: '2026-08-19',
          outcome: 'observed',
          note: null,
        },
        {
          competitorId: 'comp-corner',
          attemptedOn: '2026-08-19',
          outcome: 'unreachable',
          note: 'The listing could not be reached.',
        },
        {
          competitorId: 'comp-mill',
          attemptedOn: '2026-08-19',
          outcome: 'not_attempted',
          note: null,
        },
      ],
      changes: [
        {
          id: 'chg-sun-offer',
          competitorId: 'comp-sunrise',
          competitorName: 'Sunrise Bakery',
          kind: 'offer_appeared',
          observedOn: '2026-08-19',
          evidence: [SUN_BEFORE, SUN_AFTER],
          observation: {
            summary: 'A weekend combo block appeared on their offers page.',
            figures: [],
          },
          reading: {
            text:
              'A bundle is a price move wearing a menu. Your brain positions on quality, ' +
              'so the reply is to say what is in the box, not what it costs.',
            brandBasis: { field: 'Positioning', value: 'Same-day freshness, never day-old' },
          },
        },
      ],
    },
  ],
}

/** An in-memory store over the fixture. Mutations live for the life of the process. */
export function fixtureStore(initial: RadarSnapshot = FIXTURE_SNAPSHOT): RadarStore {
  let snap: RadarSnapshot = initial
  return {
    async read() {
      return snap
    },
    async add(_workspaceId, input) {
      const added: Competitor = {
        id: `comp-${input.url.replace(/\W+/g, '-').slice(0, 24)}`,
        name: input.name,
        url: input.url,
        kind: input.kind,
        addedOn: '2026-08-22',
        lastObservedAt: null,
      }
      snap = { ...snap, competitors: [...snap.competitors, added] }
      return added
    },
    async remove(_workspaceId, competitorId) {
      snap = {
        ...snap,
        competitors: snap.competitors.filter((c) => c.id !== competitorId),
        days: snap.days.map((day) => ({
          ...day,
          changes: day.changes.filter((c) => c.competitorId !== competitorId),
          attempts: day.attempts.filter((a) => a.competitorId !== competitorId),
        })),
      }
    },
  }
}

/** The workspace's own name, used by fixture copy that speaks about "you". */
export const FIXTURE_WORKSPACE_NAME = WORKSPACE_BAKERY

/**
 * ONE fixture store for the process, created lazily.
 *
 * NOT a fresh store per call, which is what this was first written as and which
 * would have been found at screenshot time rather than here. `radarStore()` runs
 * once per request; a store built inside it closes over its own `snap`, so
 * adding a competitor would mutate an object that is discarded before the next
 * render reads it. Add would appear to do nothing, remove would appear to do
 * nothing, and the fault would look like a broken server action rather than a
 * discarded closure.
 *
 * Module scope is the right lifetime precisely because it is the wrong one for
 * production: state shared across every request of a process is exactly what a
 * real store must never be, and the two locks below are what keep this one out
 * of there.
 */
let memoized: RadarStore | null = null

/**
 * The fixture store, or null — and null is the answer in production, always.
 *
 * Reads `process.env` at CALL TIME rather than at module load. A value captured
 * in a module constant is fixed by whichever import ran first, and a test that
 * sets `NODE_ENV=production` afterwards would pass against a stale `false`
 * without exercising the branch it claims to prove. The memo below caches the
 * STORE, never the decision, so the guard is re-evaluated on every call.
 */
export function fixtureStoreIfAllowed(): RadarStore | null {
  if (process.env.NODE_ENV === 'production') return null
  if (process.env.RADAR_FIXTURES !== '1') return null
  memoized ??= fixtureStore()
  return memoized
}

/** Drop the memo so one test's additions cannot leak into the next. */
export function resetFixtureStore(): void {
  memoized = null
}
