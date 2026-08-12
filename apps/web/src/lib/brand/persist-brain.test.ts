import { describe, expect, test, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { writeLeaf } from './leaf'
import { persistBrainVersions, type SaveBrain } from './persist-brain'
import { provenanceOf, stateOf } from './provenance'

const BASE = DEMO_FALLBACK_PAYLOAD
const EDITED = writeLeaf(BASE, 'hook.primary_emotion', 'Confidence')

function saver(result: { ok: boolean } = { ok: true }): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    result.ok ? { ok: true, version: 1, replayed: false } : { ok: false, message: 'nope' },
  )
}

describe('persistBrainVersions', () => {
  test('writes the model output, then the edit, when the user changed something', async () => {
    const save = saver()

    await persistBrainVersions(save as unknown as SaveBrain, BASE, EDITED)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenNthCalledWith(1, BASE, 'resolved')
    expect(save).toHaveBeenNthCalledWith(2, EDITED, 'manual')
  })

  test('writes ONE version when nothing was edited', async () => {
    // A `manual` twin here would claim the user confirmed every field by
    // pressing Finish, which is exactly what they did not do.
    const save = saver()

    await persistBrainVersions(save as unknown as SaveBrain, BASE, BASE)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(BASE, 'resolved')
  })

  test('an alignment-only difference is not a human edit', async () => {
    // The model recomputes signal_lock; nobody edits it. Treating a change there
    // as a user edit would write a `manual` version off the model's own work.
    const recomputed = { ...BASE, alignment: { ...BASE.alignment, note: 'different prose' } }
    const save = saver()

    await persistBrainVersions(save as unknown as SaveBrain, BASE, recomputed)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(recomputed, 'resolved')
  })

  test('with no baseline at all, saves once and claims nothing', async () => {
    const save = saver()

    await persistBrainVersions(save as unknown as SaveBrain, null, EDITED)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(EDITED, 'resolved')
  })

  test('a failed baseline write DOWNGRADES the edit to resolved', async () => {
    // Without the baseline there is nothing to diff against, and a lone `manual`
    // version would mark every field confirmed. Under-claim: the values are still
    // saved, only the confirmations are lost.
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'baseline failed' })
      .mockResolvedValueOnce({ ok: true, version: 1, replayed: false })

    const result = await persistBrainVersions(save as unknown as SaveBrain, BASE, EDITED)

    expect(save).toHaveBeenNthCalledWith(2, EDITED, 'resolved')
    expect(result.ok).toBe(true)
  })

  test('the outcome reported is the EDIT’s, not the baseline’s', async () => {
    // The user's brain is what matters; the baseline exists only so provenance
    // can be derived. A green baseline must not mask a failed real save.
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, version: 1, replayed: false })
      .mockResolvedValueOnce({ ok: false, message: 'the real save failed' })

    const result = await persistBrainVersions(save as unknown as SaveBrain, BASE, EDITED)

    expect(result).toEqual({ ok: false, message: 'the real save failed' })
  })

  /**
   * The pair exists to make this true — asserted end to end against the real
   * provenance reader rather than by counting calls.
   */
  test('the two versions it writes yield exactly the edited field as confirmed', async () => {
    const written: { source: 'resolved' | 'manual'; payload: typeof BASE }[] = []
    const save: SaveBrain = async (payload, source) => {
      written.push({ source, payload })
      return { ok: true, version: written.length, replayed: false }
    }

    await persistBrainVersions(save, BASE, EDITED)

    const provenance = provenanceOf(
      written.map((row, index) => ({ version: index + 1, source: row.source, payload: row.payload })),
    )
    expect(stateOf(provenance, 'hook.primary_emotion')).toBe('confirmed')
    expect(stateOf(provenance, 'hook.core_promise')).toBe('guessed')
    expect(stateOf(provenance, 'voice.descriptor')).toBe('guessed')
  })
})
