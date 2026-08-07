import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The seed and the board must describe the same 59 cards (SL-060).
 *
 * WHY THIS RUNS ON EVERY COMMIT. On 1 Aug the seed was found **17 cards behind
 * the board** — SL-044…049 never added, and eleven more (SL-013…020, 033, 042,
 * 043) carrying stale or empty details. A fresh seed would have silently
 * produced a board missing ten cards and stripped of the Recharts ruling, the
 * staging plan and the SL-019/020 blocked rationale.
 *
 * Nothing was broken in production, which is exactly the danger: this is the
 * disaster-recovery path, and it had been rotting for weeks with no symptom.
 * It surfaced only because doc 16 §5 happened to include an assertion nobody
 * had thought to write before — and it was ALREADY FAILING when that assertion
 * was first run. A recovery path that is only checked when somebody remembers
 * is a recovery path you find out about during the recovery.
 *
 * Same class as `packages/db/tests/migration_integrity.test.ts`: a cheap check
 * against a claim everything downstream assumes, run automatically. It lives in
 * apps/web rather than beside the seed because the Stop hook gates on turbo's
 * `test` task, and the root-level vitest suite is not part of it — the same
 * reason `turbo-env-wiring.test.ts` reads the root turbo.json from here.
 */

const ROOT = resolve(import.meta.dirname, '../../../../..')
const BOARD = resolve(ROOT, 'ops/state/board.json')
const SEED = resolve(ROOT, 'scripts/lib/ops-seed-data.mjs')

interface Card {
  code: string
  title: string
  detail: string | null
}

function boardCards(): Card[] {
  const raw = JSON.parse(readFileSync(BOARD, 'utf8')) as {
    tasks: { code: string; title: string; detail: string | null }[]
  }
  return raw.tasks.map((t) => ({ code: t.code, title: t.title, detail: t.detail ?? null }))
}

async function seedCards(): Promise<Card[]> {
  const mod = (await import(SEED)) as { tasks: () => Card[] }
  return mod.tasks().map((t) => ({ code: t.code, title: t.title, detail: t.detail ?? null }))
}

describe('a fresh seed reproduces the committed board', () => {
  it('produces the same number of cards', async () => {
    const [board, seed] = [boardCards(), await seedCards()]
    expect(seed.length, `seed has ${seed.length} cards, board has ${board.length}`).toBe(
      board.length,
    )
  })

  it('produces exactly the same card codes', async () => {
    // The failure that shipped: SL-044…049 existed on the board and nowhere in
    // the seed, so restoring from seed would have lost them without a word.
    const [board, seed] = [boardCards(), await seedCards()]
    const b = new Set(board.map((c) => c.code))
    const s = new Set(seed.map((c) => c.code))

    expect(
      [...b].filter((c) => !s.has(c)),
      'on the board but NOT in the seed',
    ).toEqual([])
    expect(
      [...s].filter((c) => !b.has(c)),
      'in the seed but NOT on the board',
    ).toEqual([])
  })

  it('produces the same title and detail for every card', async () => {
    // Details are where the rulings live — the Recharts decision, the staging
    // plan, why SL-019/020 are blocked. A seed that keeps the codes and drops
    // the details restores a board that has forgotten why.
    const [board, seed] = [boardCards(), await seedCards()]
    const byCode = new Map(seed.map((c) => [c.code, c]))

    const drifted = board
      .filter((card) => {
        const s = byCode.get(card.code)
        return s && (s.title !== card.title || s.detail !== card.detail)
      })
      .map((c) => c.code)

    expect(drifted, 'cards whose seed text no longer matches the board').toEqual([])
  })

  it('keeps codes contiguous, because the seed derives them from array index', async () => {
    // `tasks()` builds SL-### from the array position. A gap would silently
    // renumber every card after it — two cards would swap identities and the
    // diff would look like an edit rather than a corruption.
    const seed = await seedCards()
    expect(seed.map((c) => c.code)).toEqual(
      seed.map((_, i) => `SL-${String(i + 1).padStart(3, '0')}`),
    )
  })

  it('has something to check, so a moved file cannot make this pass vacuously', async () => {
    const [board, seed] = [boardCards(), await seedCards()]
    expect(board.length).toBeGreaterThan(50)
    expect(seed.length).toBeGreaterThan(50)
  })
})
