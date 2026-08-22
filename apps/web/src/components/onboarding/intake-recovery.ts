'use client'

import type { Intake } from '@/lib/onboarding/intake'

/**
 * A crash buffer for the answers typed before the resolve.
 *
 * ── WHAT IS LOST TODAY, AND WHY IT IS THE WORST PLACE TO LOSE IT ────────────
 * `/onboarding` is one route holding a four-step flow in React state: `screen`,
 * `intakeText`, `overrides` and the door result. Nothing is written anywhere
 * until the resolve. So:
 *
 *   reload on step 2 or 3   every typed word gone, back to an empty intake box
 *   Back from step 3        leaves /onboarding entirely — the flow pushes no
 *                           history entry per step, so the browser's Back goes
 *                           to whatever preceded the route
 *
 * This is the first thing a new customer does, it is where they describe their
 * business in their own words, and the step after it charges 50 credits. The
 * composer already has this buffer (`components/posts/draft-recovery.ts`) for a
 * loss that costs strictly less.
 *
 * ── THE SAME REASONING AS THE COMPOSER'S, WHICH IS WHY IT IS THE SAME SHAPE ──
 * A server action cannot outlive the navigation that triggered it: flushing on
 * `popstate` produces `net::ERR_ABORTED`, measured on the composer. So the write
 * happens HERE, synchronously, on every change, where no navigation can cancel
 * it — and the next mount hands it back.
 *
 * `sessionStorage`, not `localStorage`: a crash buffer for THIS tab, not a
 * synced draft. Two tabs setting up two workspaces must not hand each other a
 * business description.
 *
 * Cleared the moment a resolve succeeds — after that the brain is the record and
 * this would only be a stale second copy.
 */

const KEY = 'sahoda.onboarding.intake'

/** Bounded so a runaway paste cannot fill the quota and break the tab. */
const MAX_STASH_BYTES = 20_000

export interface IntakeStash {
  /** Which step the person had reached. */
  screen: string
  /** What they typed, verbatim. */
  text: string
  /** The three classifier answers they corrected by hand. */
  overrides: Partial<Intake>
}

/**
 * Every storage call is guarded. `sessionStorage` throws on access in a
 * partitioned or storage-blocked context, and a recovery buffer that can take
 * onboarding down is worse than no recovery buffer.
 */
export function stashIntake(stash: IntakeStash): void {
  try {
    // Nothing typed is nothing to recover, and an empty stash would otherwise
    // overwrite a real one when a later mount re-renders at its default.
    if (stash.text.trim() === '' && Object.keys(stash.overrides).length === 0) return
    const payload = JSON.stringify(stash)
    if (payload.length > MAX_STASH_BYTES) return
    sessionStorage.setItem(KEY, payload)
  } catch {
    // No buffer available. The flow still works; a reload just costs the words.
  }
}

export function readIntakeStash(): IntakeStash | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    // Shape-checked rather than cast: this came from storage, which anything on
    // the origin can write, and a malformed object would reach the resolve.
    if (typeof parsed !== 'object' || parsed === null) return null
    const stash = parsed as Partial<IntakeStash>
    if (typeof stash.text !== 'string' || typeof stash.screen !== 'string') return null
    if (typeof stash.overrides !== 'object' || stash.overrides === null) return null
    if (Array.isArray(stash.overrides)) return null
    return { screen: stash.screen, text: stash.text, overrides: stash.overrides }
  } catch {
    return null
  }
}

export function clearIntakeStash(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to do — see stashIntake.
  }
}
