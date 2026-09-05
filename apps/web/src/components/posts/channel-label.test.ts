import { CHANNEL_LABELS as SHARED_LABELS, ChannelSchema } from '@sahoda/shared'
import { describe, expect, it } from 'vitest'

import { CHANNEL_LABELS, CHANNEL_SHORT, PLATFORM_LABELS } from './channel-label'

/**
 * THE TEST ACROSS A SEAM THAT HAS TO EXIST.
 *
 * There are two copies of the same six channel names and that is deliberate, so
 * this file is the thing that stops them drifting.
 *
 * ── WHY NOT ONE COPY ─────────────────────────────────────────────────────────
 * The adapters build sentences a customer reads ("Google Business Profile allows
 * 1 attachment per post"), and until 2026-09-03 they interpolated the raw enum
 * key instead, so a shop owner read "gbp allows 1 media items". Fixing that
 * needed the names inside `packages/shared`, which cannot import from `apps/web`.
 *
 * Making `apps/web` re-export the shared map instead looks like the tidy answer
 * and was tried. MEASURED, `next build` either side of that one-line change:
 * `/(app)/posts` went from 675.4 kB to 686.3 kB, **+10.9 kB over budget**, on
 * every route that renders a channel name. `packages/shared/package.json` has
 * carried the reason since search-tokens.ts did the same thing to eleven routes:
 * the barrel re-exports every module, so one import from it reaches the whole
 * constraint table. A presentation string is not worth that on a phone.
 *
 * So: two objects, one guard. If a channel is added, `Record<Channel, string>`
 * makes both files a compile error, and this makes disagreement a red test.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * Nothing about a THIRD copy. It compares these two maps only, so a component
 * that hand-writes "Facebook" in a sentence, or a fourth map added elsewhere,
 * walks straight past. It also says nothing about whether either name is the one
 * the platform calls itself.
 */

describe('the two channel-label maps', () => {
  it('agree, name for name', () => {
    expect(CHANNEL_LABELS).toEqual(SHARED_LABELS)
  })

  it('name every channel the schema admits, in both copies', () => {
    for (const channel of ChannelSchema.options) {
      expect(CHANNEL_LABELS[channel]).toBeTruthy()
      expect(SHARED_LABELS[channel]).toBeTruthy()
      // A label is never the key: rendering `gbp` is the defect all of this is
      // here to prevent, and a map that quietly fell back to the key would look
      // populated.
      expect(CHANNEL_LABELS[channel]).not.toBe(channel)
    }
  })

  it('keeps the short form a short form, and the platform map a superset', () => {
    // CHANNEL_SHORT exists because "Google Business Profile" does not fit a pill.
    expect(CHANNEL_SHORT.gbp.length).toBeLessThan(CHANNEL_LABELS.gbp.length)
    // PLATFORM_LABELS spreads CHANNEL_LABELS, so every channel keeps its name
    // when the subject is an account being linked rather than a post going out.
    for (const channel of ChannelSchema.options) {
      expect(PLATFORM_LABELS[channel]).toBe(CHANNEL_LABELS[channel])
    }
  })
})
