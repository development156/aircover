import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { writeLeaf } from '@/lib/brand/leaf'
import { MAX_OPEN_LIST_ENTRIES } from '@/lib/brand/limits'

/**
 * `confirmBrainField` — the free, per-field write that makes an edited field
 * confirmed.
 *
 * The load-bearing assertion in this file is a NEGATIVE one: this path must never
 * reach the mesh or the ledger. A resolve is 50 credits and rewrites all fifteen
 * fields, so wiring an edit to it would charge fifty credits to record one
 * sentence AND demote every previously confirmed field back to a guess.
 */

const BRAIN = DEMO_FALLBACK_PAYLOAD

const state = vi.hoisted(() => ({
  brainRead: null as unknown,
  saveResult: { ok: true, version: 4, replayed: false } as unknown,
}))

const saveBrandMemory = vi.hoisted(() => vi.fn())
const runTask = vi.hoisted(() => vi.fn())
const createWithCredits = vi.hoisted(() => vi.fn())

vi.mock('@/app/actions/brand-resolve', () => ({
  saveBrandMemory,
}))

vi.mock('@/lib/brand/read-brain', () => ({
  readBrain: () => Promise.resolve(state.brainRead),
}))

vi.mock('@/lib/observability/report', () => ({
  reportServerError: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Present so a stray import would be OBSERVABLE rather than merely absent: a
// call to either of these is the 50-credit trap actually springing.
vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({ runTask }),
  brandGuidelinesTask: { def: {} },
}))
vi.mock('@sahoda/billing', () => ({
  createWithCredits,
  createPgLedgerPort: () => ({}),
  loadBillingEnv: () => ({ databaseUrl: 'postgres://test' }),
}))

const { confirmBrainField } = await import('./brand-field')

beforeEach(() => {
  vi.clearAllMocks()
  state.brainRead = {
    status: 'ok',
    active: BRAIN,
    version: 3,
    provenance: new Map(),
    meta: undefined,
  }
  saveBrandMemory.mockImplementation(() => Promise.resolve(state.saveResult))
})

describe('confirmBrainField', () => {
  test('saves the changed field as a MANUAL version', async () => {
    const result = await confirmBrainField('hook.primary_emotion', 'Confidence')

    expect(result).toEqual({ ok: true, version: 4, unchanged: false })
    // `manual` picks which provenance rule applies, and naming the path is what
    // records authorship — saving this as `resolved` with no path would render
    // the user's own sentence back to them as a machine guess.
    expect(saveBrandMemory).toHaveBeenCalledWith(
      writeLeaf(BRAIN, 'hook.primary_emotion', 'Confidence'),
      'manual',
      ['hook.primary_emotion'],
    )
  })

  test('changes exactly one field and leaves the other fourteen alone', async () => {
    await confirmBrainField('voice.descriptor', 'Blunt and quick')

    const [payload] = saveBrandMemory.mock.calls[0]!
    expect(payload.voice.descriptor).toBe('Blunt and quick')
    expect(payload.hook).toEqual(BRAIN.hook)
    expect(payload.taboo).toEqual(BRAIN.taboo)
    expect(payload.customer_persona).toEqual(BRAIN.customer_persona)
  })

  test('NEVER re-resolves — no model call and no credit wrapper', async () => {
    await confirmBrainField('hook.primary_emotion', 'Confidence')

    expect(runTask).not.toHaveBeenCalled()
    expect(createWithCredits).not.toHaveBeenCalled()
  })

  /**
   * The runtime assertion above can only prove that TODAY's code path does not
   * charge. It cannot catch someone adding `resolveBrand` to this action later,
   * because `@/app/actions/brand-resolve` is mocked wholesale here — the mesh
   * would never be reached even if it were wired in.
   *
   * So the guard is also STATIC. The 50-credit trap is a wiring mistake, and
   * wiring is visible in the imports.
   */
  test('the module does not import the paid resolve path at all', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const source = readFileSync(fileURLToPath(new URL('./brand-field.ts', import.meta.url)), 'utf8')
    // Import lines only. The file's own doc comment names `withCredits` in order
    // to explain why it does not use it, and a whole-file match would read that
    // explanation as the violation it warns against.
    const imports = source.match(/^\s*import\s[\s\S]*?from\s+'[^']+'/gm)?.join('\n') ?? ''

    expect(imports, 'confirming a field must never reach the model').not.toMatch(/@sahoda\/mesh/)
    expect(imports, 'confirming a field must never reserve or debit credits').not.toMatch(
      /@sahoda\/billing|withCredits/,
    )
    expect(imports, 'confirming a field must never trigger a resolve').not.toMatch(/resolveBrand/)
    // Proves the extraction actually found the imports — an empty string would
    // pass all three assertions above while checking nothing.
    expect(imports).toMatch(/@\/lib\/brand\/read-brain/)
  })

  test('unchanged text on a GUESS confirms it — the value did not move, the claim did', async () => {
    // The interaction version-diffing could not express at all. An identical
    // payload records no change, so the old diff had nothing to attribute and
    // the editor refused the write; a user who agreed with what they read had to
    // retype it verbatim to be counted. `field_meta` carries the confirmation
    // independently of the text, so agreeing costs one tap.
    const result = await confirmBrainField('hook.primary_emotion', BRAIN.hook.primary_emotion)

    expect(result).toEqual({ ok: true, version: 4, unchanged: false })
    expect(saveBrandMemory).toHaveBeenCalledWith(BRAIN, 'manual', ['hook.primary_emotion'])
  })

  test('an unchanged LIST confirms too', async () => {
    const result = await confirmBrainField('taboo.red_lines', [...BRAIN.taboo.red_lines])

    expect(result).toEqual({ ok: true, version: 4, unchanged: false })
    expect(saveBrandMemory).toHaveBeenCalledWith(BRAIN, 'manual', ['taboo.red_lines'])
  })

  test('unchanged text on an ALREADY-confirmed field writes nothing', async () => {
    // The only true no-op left: no new value and no new fact about who stands
    // behind it, so a write would burn a version to record nothing.
    state.brainRead = {
      status: 'ok',
      active: BRAIN,
      version: 3,
      provenance: new Map(),
      meta: { 'hook.primary_emotion': { kind: 'asked', confirmed: true, source: 'owner' } },
    }

    const result = await confirmBrainField('hook.primary_emotion', BRAIN.hook.primary_emotion)

    expect(result).toEqual({ ok: true, version: 3, unchanged: true })
    expect(saveBrandMemory).not.toHaveBeenCalled()
  })

  test('a reordered list IS a change', async () => {
    await confirmBrainField('taboo.red_lines', [...BRAIN.taboo.red_lines].reverse())
    expect(saveBrandMemory).toHaveBeenCalled()
  })

  describe('refuses what it cannot honestly save', () => {
    test('a derived field — nobody can confirm a conclusion', async () => {
      const result = await confirmBrainField('alignment.signal_lock', 'strong')

      expect(result).toEqual({ ok: false, message: 'That field cannot be edited.' })
      expect(saveBrandMemory).not.toHaveBeenCalled()
    })

    test('an unknown path', async () => {
      const result = await confirmBrainField('voice.nope', 'x')
      expect(result.ok).toBe(false)
      expect(saveBrandMemory).not.toHaveBeenCalled()
    })

    test('a list value on a text field', async () => {
      const result = await confirmBrainField('hook.primary_emotion', ['a'])
      expect(result).toEqual({ ok: false, message: 'That field expects text.' })
    })

    test('a text value on a list field', async () => {
      const result = await confirmBrainField('taboo.red_lines', 'a')
      expect(result).toEqual({ ok: false, message: 'That field expects a list.' })
    })

    test('a fixed-length list that is not exactly three', async () => {
      // The payload contract pins these at 3; the RPC rejects anything else with
      // INVALID_PAYLOAD, which reaches the user as unreadable boilerplate.
      const result = await confirmBrainField('voice.signature_phrases', ['a', 'b'])
      expect(result).toEqual({ ok: false, message: 'This list holds exactly three entries.' })
    })

    test('an open list past the 40-entry cap', async () => {
      const tooMany = Array.from({ length: MAX_OPEN_LIST_ENTRIES + 1 }, (_, i) => `line ${i}`)
      const result = await confirmBrainField('taboo.red_lines', tooMany)

      expect(result.ok).toBe(false)
      expect(saveBrandMemory).not.toHaveBeenCalled()
    })
  })

  describe('read failures name their own remedy', () => {
    test('no workspace', async () => {
      state.brainRead = { status: 'no-workspace' }
      const result = await confirmBrainField('hook.primary_emotion', 'Confidence')
      expect(result).toEqual({ ok: false, message: 'Create a workspace first.' })
    })

    test('no brain yet', async () => {
      state.brainRead = { status: 'no-brain' }
      const result = await confirmBrainField('hook.primary_emotion', 'Confidence')
      expect(result).toEqual({
        ok: false,
        message: 'Set up your Brand Brain before editing it.',
      })
    })

    test('unreadable — reload, and nothing was written', async () => {
      state.brainRead = { status: 'unreadable' }
      const result = await confirmBrainField('hook.primary_emotion', 'Confidence')

      expect(result.ok).toBe(false)
      expect(saveBrandMemory).not.toHaveBeenCalled()
    })
  })

  test('a failed save surfaces the save’s own message, not a generic one', async () => {
    saveBrandMemory.mockResolvedValue({ ok: false, message: 'Reload — someone else saved first.' })

    const result = await confirmBrainField('hook.primary_emotion', 'Confidence')

    expect(result).toEqual({ ok: false, message: 'Reload — someone else saved first.' })
  })
})

/**
 * MEASURED 2026-09-06 on the wt-core preview against production: three spaces
 * were saved as `hook.core_promise` (version 11, `confirmed: true`, source
 * `owner`) and a single space as the third core value (version 8). `validate`
 * checked type and length and nothing else, so the field the console calls
 * "worth the least as a guess" became a confirmed blank. Mesh prepends the
 * active brain to every model call, so that blank was the promise every caption
 * would have been written from.
 */
describe('confirmBrainField refuses a blank', () => {
  test('whitespace text is refused before any read or write', async () => {
    const result = await confirmBrainField('hook.core_promise', '   ')

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ message: expect.stringMatching(/blank/i) })
    expect(saveBrandMemory).not.toHaveBeenCalled()
  })

  test('a fixed list with a whitespace entry is refused', async () => {
    const result = await confirmBrainField('brand_persona.core_values', ['Craft', 'Care', ' '])

    expect(result.ok).toBe(false)
    expect(saveBrandMemory).not.toHaveBeenCalled()
  })

  test('an EMPTY open list still saves — "there are none" is an answer', async () => {
    const result = await confirmBrainField('taboo.red_lines', [])

    expect(result.ok).toBe(true)
    expect(saveBrandMemory).toHaveBeenCalledTimes(1)
  })
})
