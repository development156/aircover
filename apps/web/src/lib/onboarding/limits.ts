import 'server-only'

import { fixedWindowAllow } from '@/lib/ops/rate-limit'

/**
 * The two unpaid model paths in onboarding, bounded.
 *
 * ── WHY BOTH KEYS ────────────────────────────────────────────────────────────
 * Every guard here is keyed on the PERSON as well as the workspace. wt-audit
 * left "unlimited free workspaces" open, and `bootstrap_workspace` replays only
 * for a current owner: erase, create, and a workspace-keyed limit starts from
 * zero. The Clerk user id survives all of that.
 *
 * ── WHY THESE NUMBERS ────────────────────────────────────────────────────────
 * A door read takes ~26s at p50, so four a minute is already faster than a
 * person can press the button; thirty a day covers a founder trying every page
 * of a brand book and still ends a script. Three free Brand Brain builds a day
 * is the "charge for output, not identity" rule with a floor under it: the
 * fourth attempt in a day is somebody looping, not somebody choosing.
 *
 * `fixedWindowAllow` FAILS OPEN when Upstash is not configured. That is the
 * limiter's documented trade and it is the right one here too: the paid PDF arm
 * behind the door holds credits regardless, and a limiter outage should not
 * lock a real customer out of a screen that costs cents.
 */
export const DOOR_READS_PER_MINUTE = 4
export const DOOR_READS_PER_DAY = 30
export const FREE_RESOLVES_PER_DAY = 3

const MINUTE_SECONDS = 60
const DAY_SECONDS = 86_400

async function allBothKeys(
  family: string,
  userId: string,
  workspaceId: string,
  windows: ReadonlyArray<{ tag: string; limit: number; seconds: number }>,
): Promise<boolean> {
  const verdicts = await Promise.all(
    windows.flatMap(({ tag, limit, seconds }) => [
      fixedWindowAllow(`${family}:${tag}u:${userId}`, limit, seconds),
      fixedWindowAllow(`${family}:${tag}w:${workspaceId}`, limit, seconds),
    ]),
  )
  return verdicts.every((verdict) => verdict.allowed)
}

/** May this person, in this workspace, run the door read now? */
export function doorReadAllowed(userId: string, workspaceId: string): Promise<boolean> {
  return allBothKeys('door', userId, workspaceId, [
    { tag: '', limit: DOOR_READS_PER_MINUTE, seconds: MINUTE_SECONDS },
    { tag: 'day:', limit: DOOR_READS_PER_DAY, seconds: DAY_SECONDS },
  ])
}

/** May this person, in this workspace, take another FREE Brand Brain build today? */
export function freeResolveAllowed(userId: string, workspaceId: string): Promise<boolean> {
  return allBothKeys('resolve:free', userId, workspaceId, [
    { tag: 'day:', limit: FREE_RESOLVES_PER_DAY, seconds: DAY_SECONDS },
  ])
}
