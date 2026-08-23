import 'server-only'

import { auth } from '@clerk/nextjs/server'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * HAS THIS PERSON ALREADY BEEN SHOWN THE BOOT ANIMATION?
 *
 * ── WHY NOT localStorage ─────────────────────────────────────────────────────
 * The ruling is that it plays once and never again, and "never again" has to
 * survive a second device, a cleared browser and a private window. localStorage
 * survives none of those, so it would answer "no" to the same person on their
 * phone and play a ten-second film at somebody who has already sat through it.
 *
 * ── WHY `users_profile.prefs` AND NOT A NEW COLUMN ───────────────────────────
 * A column is a migration, and a migration this lane cannot apply is a flag that
 * works here and does not work in production — worse than no flag, because it
 * would test green. `users_profile` already carries a free-form `prefs jsonb`
 * and already carries live keys (`mode`, `sahoda`, `reduced_motion`,
 * `theme_override` are in production today), which is exactly what that column
 * is for.
 *
 * ── WHY PER USER AND NOT PER WORKSPACE ───────────────────────────────────────
 * "Plays once, on first completion only" is a statement about a PERSON. A
 * workspace-scoped flag would replay the film at somebody who created a second
 * brand, and would suppress it for a colleague who joined a workspace that had
 * already been onboarded — the second is right by accident and the first is
 * simply wrong. `users_profile` is keyed by `user_id` and its RLS is
 * `user_id = auth.jwt() ->> 'sub'` on both select and update, so a person can
 * read and write their own row and no one else's. No service-role client is
 * involved and `apps/web` still has none.
 *
 * ── READ-MODIFY-WRITE, AND WHY THAT IS SAFE HERE ─────────────────────────────
 * PostgREST cannot express a `jsonb ||` merge, so the write reads `prefs`,
 * spreads it and puts it back. That is a lost-update race in general. It is not
 * one here: this key is written EXACTLY ONCE per account, at the end of
 * onboarding, from a single click, and losing the race would cost a duplicate
 * ten seconds rather than data. Clobbering is what would matter, and the spread
 * is what prevents it — an unconditional `{ boot_video_seen: true }` would erase
 * the four keys quoted above.
 */
const BOOT_VIDEO_SEEN_KEY = 'boot_video_seen'

type Prefs = Record<string, unknown>

/**
 * Three answers, not two.
 *
 * `unknown` is a read that did not happen, and it must not be spelled `false`:
 * "we could not check" would play the film at someone who has seen it, on the
 * one screen where there is deliberately no way to stop it. The caller treats
 * `unknown` as SEEN for that reason — the worse failure is showing it twice, not
 * missing it once, and a customer who never gets the animation has lost nothing
 * they can name.
 */
export type BootVideoSeen = 'seen' | 'not-seen' | 'unknown'

export async function readBootVideoSeen(): Promise<BootVideoSeen> {
  try {
    const { userId } = await auth()
    if (!userId) return 'unknown'

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('users_profile')
      .select('prefs')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[boot-video] prefs read failed', error.code, error.message)
      return 'unknown'
    }
    // NO ROW is a real answer and it is `not-seen`. Every account that can reach
    // this screen went through `bootstrap_workspace`, which upserts the profile
    // in the same transaction as the workspace — so a missing row means the
    // write below will find nothing to update, which `markBootVideoSeen` reports
    // rather than swallows.
    if (!data) return 'not-seen'

    const prefs = (data as { prefs?: unknown }).prefs
    if (!prefs || typeof prefs !== 'object') return 'not-seen'
    return (prefs as Prefs)[BOOT_VIDEO_SEEN_KEY] === true ? 'seen' : 'not-seen'
  } catch (error) {
    console.error(
      '[boot-video] prefs read threw',
      error instanceof Error ? error.message : 'unknown',
    )
    return 'unknown'
  }
}

/** What the write did. `no-row` is the case that would silently replay forever. */
export type MarkResult = 'saved' | 'no-row' | 'failed'

export async function writeBootVideoSeen(): Promise<MarkResult> {
  try {
    const { userId } = await auth()
    if (!userId) return 'failed'

    const supabase = createServerSupabase()

    const current = await supabase
      .from('users_profile')
      .select('prefs')
      .eq('user_id', userId)
      .maybeSingle()

    if (current.error) {
      console.error('[boot-video] prefs pre-read failed', current.error.code, current.error.message)
      return 'failed'
    }

    const existing = (current.data as { prefs?: unknown } | null)?.prefs
    const merged: Prefs = {
      ...(existing && typeof existing === 'object' ? (existing as Prefs) : {}),
      [BOOT_VIDEO_SEEN_KEY]: true,
    }

    // `select('user_id')` is the whole point of this statement. supabase-js
    // reports a successful UPDATE that matched NOTHING as `{ error: null }`,
    // which is indistinguishable from a write that landed — and the difference
    // is a customer who sees the film on every sign-in forever. RLS also refuses
    // by matching zero rows rather than by erroring, so this is the only way to
    // tell "written" from "refused".
    const { data, error } = await supabase
      .from('users_profile')
      .update({ prefs: merged })
      .eq('user_id', userId)
      .select('user_id')

    if (error) {
      console.error('[boot-video] prefs write failed', error.code, error.message)
      return 'failed'
    }
    if (!data || data.length === 0) {
      console.error('[boot-video] prefs write matched NO ROW for', userId)
      return 'no-row'
    }
    return 'saved'
  } catch (error) {
    console.error(
      '[boot-video] prefs write threw',
      error instanceof Error ? error.message : 'unknown',
    )
    return 'failed'
  }
}
