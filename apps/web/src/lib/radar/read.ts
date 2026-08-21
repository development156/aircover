import 'server-only'

import { fixtureStoreIfAllowed } from './fixtures'
import { supabaseRadarStore } from './store'
import type { RadarStore } from './port'

/**
 * WHICH RADAR THIS PROCESS IS TALKING TO.
 *
 * The fixture branch is asked FIRST and answers null in every environment that
 * has not explicitly opted in — see `fixtures.ts` for the two locks and
 * `fixtures.test.ts` for the production refusal, which is asserted rather than
 * asserted-about. Ordering it first keeps the decision in one expression; the
 * safety is in `fixtureStoreIfAllowed` itself, not in the order of these lines,
 * because safety that depends on statement order is safety one refactor deep.
 */
export function radarStore(): RadarStore {
  return fixtureStoreIfAllowed() ?? supabaseRadarStore()
}
