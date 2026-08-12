import { describe, expect, test, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { nextFieldMeta } from './field-meta'
import { writeLeaf } from './leaf'
import { persistBrainVersions, type SaveBrain } from './persist-brain'
import { provenanceOf, stateOf } from './provenance'

const BASE = DEMO_FALLBACK_PAYLOAD
const EDITED = writeLeaf(BASE, 'hook.primary_emotion', 'Confidence')

function saver(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, version: 1, replayed: false })
}

describe('persistBrainVersions', () => {
  test('writes ONE version, naming the fields the user edited', async () => {
    // This used to write two — the model's output then the user's — so that
    // diffing the pair recovered who wrote what. field_meta records it directly,
    // so the second version was a wasted write.
    const save = saver()

    await persistBrainVersions(save as unknown as SaveBrain, BASE, EDITED)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(EDITED, 'manual', ['hook.primary_emotion'])
  })

  test('claims nothing when the user edited nothing', async () => {
    // Naming fields here would claim the user confirmed every one of them by
    // pressing Finish, which is exactly what they did not do.
    const save = saver()

    await persistBrainVersions(save as unknown as SaveBrain, BASE, BASE)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(BASE, 'resolved')
  })

  test('an alignment-only difference is not a human edit', async () => {
    // The model recomputes signal_lock; nobody edits it. Treating a change there
    // as a user edit would claim a confirmation off the model's own work.
    const recomputed = { ...BASE, alignment: { ...BASE.alignment, note: 'different prose' } }
    const save = saver()

    await persistBrainVersions(save as unknown as SaveBrain, BASE, recomputed)

    expect(save).toHaveBeenCalledWith(recomputed, 'resolved')
  })

  test('with no baseline at all, saves once and claims nothing', async () => {
    const save = saver()

    await persistBrainVersions(save as unknown as SaveBrain, null, EDITED)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(EDITED, 'resolved')
  })

  test('names every edited field, not just the first', async () => {
    const twice = writeLeaf(EDITED, 'voice.descriptor', 'Brisk and plain')
    const save = saver()

    await persistBrainVersions(save as unknown as SaveBrain, BASE, twice)

    const [, , paths] = save.mock.calls[0] as [unknown, unknown, string[]]
    expect([...paths].sort()).toEqual(['hook.primary_emotion', 'voice.descriptor'])
  })

  test('the outcome reported is the save’s own', async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, message: 'the save failed' })

    const result = await persistBrainVersions(save as unknown as SaveBrain, BASE, EDITED)

    expect(result).toEqual({ ok: false, message: 'the save failed' })
  })

  /**
   * Asserted end to end against the real meta writer and reader rather than by
   * counting calls — the point of the paths is what they make true on /brain.
   */
  test('what it writes yields exactly the edited field as confirmed', async () => {
    let captured: string[] = []
    const save: SaveBrain = async (_payload, _source, confirmPaths = []) => {
      captured = [...confirmPaths]
      return { ok: true, version: 1, replayed: false }
    }

    await persistBrainVersions(save, BASE, EDITED)

    const provenance = provenanceOf(
      nextFieldMeta({ payload: BASE, meta: undefined }, EDITED, captured),
    )
    expect(stateOf(provenance, 'hook.primary_emotion')).toBe('confirmed')
    expect(stateOf(provenance, 'hook.core_promise')).toBe('guessed')
    expect(stateOf(provenance, 'voice.descriptor')).toBe('guessed')
  })
})
