'use server'

import { writeBootVideoSeen } from '@/lib/onboarding/boot-video-seen'

/**
 * Record that the boot animation has been shown to this person.
 *
 * Called from the client the moment playback genuinely STARTS — on the video's
 * own `playing` event, not on the click and not on `ended`. The three differ:
 *
 *   on click   would mark a film that never loaded, so a customer whose network
 *              dropped the file would never be given it again;
 *   on ended   would replay the whole thing for anyone who closed the tab at
 *              nine seconds, which is the same ten seconds they already watched;
 *   on playing is the honest one — frames reached a screen.
 *
 * The result is RETURNED rather than swallowed. `no-row` means the UPDATE
 * matched nothing, which would replay the animation on every future visit, and a
 * caller that cannot see the difference cannot report it.
 */
export async function markBootVideoSeen(): Promise<{ result: 'saved' | 'no-row' | 'failed' }> {
  return { result: await writeBootVideoSeen() }
}
