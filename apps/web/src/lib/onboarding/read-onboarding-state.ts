import 'server-only'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * WHERE DOES THIS ACCOUNT BELONG — onboarding, or the dashboard?
 *
 * ── WHY THIS IS NOT `activeBrandMemory(id) === null` ─────────────────────────
 * `activeBrandMemory` answers `null` for THREE different facts: this workspace
 * has no brain, its payload no longer parses, and *the read did not happen* —
 * `if (error || !data) return null`, plus a `catch` that swallows a thrown
 * fetch. That is fine where it is used, because both callers only ever ask "may
 * I charge for this resolve" and every arm of a failed read answers "treat it as
 * free", which errs toward the customer.
 *
 * It is NOT fine as a ROUTING signal. A redirect built on that null sends a
 * customer who finished onboarding weeks ago back to the first screen of it
 * because one Supabase call hiccuped — the exact "one null, two meanings" defect
 * this codebase has now shipped four times and pinned by name in
 * `lib/one-null-two-meanings.test.ts`. So this read keeps the two apart and the
 * gate acts on `not-started` ONLY.
 *
 * ── FOUR ANSWERS, AND EACH ONE ROUTES DIFFERENTLY ────────────────────────────
 *  · `completed`    — a Brand Brain exists. The dashboard, and nothing sends
 *                     them back into the flow.
 *  · `not-started`  — a workspace with no brain. Onboarding. Whether they are
 *                     brand new or half way through is a fact only the browser
 *                     holds (the flow's resume point is localStorage, keyed per
 *                     workspace), and the stage restores it on mount — so both
 *                     cases route to the same URL and land on different screens.
 *  · `no-workspace` — nothing to onboard INTO yet. Onboarding too, which is
 *                     where the create-workspace remedy lives.
 *  · `unreadable`   — we did not find out. NOBODY MAY BE MOVED ON THIS. A
 *                     redirect here is a claim about the account that nothing
 *                     measured.
 *
 * ── AND THE UNPARSEABLE PAYLOAD IS DELIBERATELY `completed` ──────────────────
 * A row that exists but no longer matches the contract means this workspace HAS
 * been through the flow. `activeBrandMemory` degrades it to "no saved brain" so
 * the editor is not handed half a brain, which is right for the editor. Routing
 * has the opposite duty: walking a paying customer through nine screens again
 * because a schema moved under them is the worse of the two failures. The row's
 * existence is the fact this file needs, so it selects `id` and nothing else.
 */
export type OnboardingStatus = 'completed' | 'not-started' | 'no-workspace' | 'unreadable'

export interface OnboardingStateRead {
  status: OnboardingStatus
}

async function readOnboardingState(): Promise<OnboardingStateRead> {
  const workspace = await activeWorkspaceRead()
  // Both bad arms return WITHOUT touching the database. A query issued with a
  // workspace we could not identify is a question about the wrong tenant.
  if (workspace.status === 'none') return { status: 'no-workspace' }
  if (workspace.status === 'unreadable') return { status: 'unreadable' }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('brand_memory')
      .select('id')
      .eq('workspace_id', workspace.workspace.id)
      .eq('status', 'active')
      .limit(1)

    // The whole point of the file. `error` is "we could not look" and an empty
    // array is "there is nothing there", and they route to opposite places.
    if (error) {
      console.error('[onboarding-state] read failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    if (!data) return { status: 'unreadable' }

    return { status: data.length > 0 ? 'completed' : 'not-started' }
  } catch (error) {
    console.error(
      '[onboarding-state] read threw',
      error instanceof Error ? error.message : 'unknown',
    )
    return { status: 'unreadable' }
  }
}

/**
 * Request-scoped, so the layout gate and anything else asking the same question
 * in the same render share ONE query and — more to the point — one ANSWER.
 * Two panels that each ask separately are two chances to disagree.
 */
export const onboardingStateRead = cache(readOnboardingState)
