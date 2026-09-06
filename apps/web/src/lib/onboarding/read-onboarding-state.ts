import 'server-only'

import { cache } from 'react'

import { readBrain } from '@/lib/brand/read-brain'

/**
 * WHERE DOES THIS ACCOUNT BELONG — onboarding, or the dashboard?
 *
 * ── DERIVED FROM `readBrain`, NOT A SECOND QUERY ─────────────────────────────
 * This used to select `id` from `brand_memory` on its own, and `readBrain`
 * selected the same active row for the topbar ring and the dashboard's Brand
 * Brain card in the same render. MEASURED 2026-09-06 in production edge logs:
 * two `brand_memory` queries on every /home render, 63ms apart, asking the
 * same table the same question. `readBrain` is `cache()`d, so reading it here
 * costs nothing when anything else on the screen already has.
 *
 * ── THE THREE-WAY ANSWER SURVIVES, AND THAT IS THE POINT ─────────────────────
 * A redirect built on a null that means three things sends a customer who
 * finished onboarding weeks ago back to its first screen the moment one query
 * times out. `readBrain` keeps the three apart: `no-brain` is a fact about the
 * workspace, `unreadable` is a question that got no answer, and only the first
 * may route anybody. A stored payload that no longer parses reads as
 * `unreadable` too — which is right: an account with a brain row is not an
 * account that never onboarded, whatever state the row is in.
 */
export type OnboardingStatus = 'completed' | 'not-started' | 'no-workspace' | 'unreadable'

export interface OnboardingStateRead {
  status: OnboardingStatus
}

async function readOnboardingState(): Promise<OnboardingStateRead> {
  const brain = await readBrain()
  switch (brain.status) {
    case 'ok':
      return { status: 'completed' }
    case 'no-brain':
      return { status: 'not-started' }
    case 'no-workspace':
      return { status: 'no-workspace' }
    case 'unreadable':
      return { status: 'unreadable' }
  }
}

export const onboardingStateRead = cache(readOnboardingState)
