import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { RunHistory } from '@/components/playbooks/run-history'

/**
 * A live run holds its playbook's only slot, and the screen has to say so.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * Two regexes over text, one on the migrations and one on the component:
 *  · every migration file is CONCATENATED and the first
 *    `one_live_per_playbook … where status in (…)` wins, so an index that a
 *    later migration DROPPED, or narrowed, still matches its original CREATE;
 *  · a predicate written another way — `status = any(array[…])`, a NOT IN, a
 *    condition on a different column — reads as the index being absent;
 *  · `HOLDS_THE_SLOT` is read as a literal `new Set([…])`. Built any other way
 *    — spread from a const, filtered, imported — it is not found;
 *  · that the component USES the set it declares. This compares two
 *    declarations; a component that computed the sentence from something else
 *    entirely would still pass;
 *  · the live database, for the same reason the one above cannot: these are
 *    files, not the catalog.
 *
 * ── THE BEHAVIOUR THIS PINS IS CORRECT, WHICH IS THE PROBLEM ─────────────────
 * Two rules, each right. A playbook may have one live run at a time —
 * `playbook_runs_one_live_per_playbook`, a partial unique index — and a run that
 * has PROPOSED but not been approved is still live. So an unopened cost preview
 * stops the daily schedule from proposing anything new for that playbook: the
 * cron counts it as `alreadyRunning` and moves on, which is what stops a second
 * charge for the same festival.
 *
 * Nothing is broken and nothing was visible. A playbook that has not fired for
 * three weeks, with a preview nobody opened, reads exactly like a schedule that
 * stopped working. The sentence is the whole fix.
 */
const run = (status: string) => ({
  id: `run-${status}`,
  recipe_key: 'festival',
  status,
  trigger_source: 'schedule' as const,
  started_at: '2026-08-20T00:00:00.000Z',
  spent_credits: 0,
  items: [],
})

const SENTENCE = /Nothing new will be proposed for this playbook/

describe('a run that holds the slot says so', () => {
  /**
   * The set is not restated here — it is READ OUT OF THE MIGRATION. A hand-typed
   * copy is how a component and its database drift apart quietly, and this
   * component's whole job is to describe what that index does.
   */
  it('the component gates on exactly the statuses the partial unique index names', () => {
    const dir = resolve(import.meta.dirname, '../../../../../packages/db/supabase/migrations')
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')

    const index = /one_live_per_playbook[\s\S]{0,400}?where\s+status\s+in\s*\(([^)]*)\)/i.exec(sql)
    expect(index, 'playbook_runs_one_live_per_playbook not found in the migrations').not.toBeNull()
    const fromMigration = new Set([...index![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]))

    const source = readFileSync(resolve(import.meta.dirname, 'run-history.tsx'), 'utf8')
    const declared = /const HOLDS_THE_SLOT = new Set\(\[([^\]]*)\]\)/.exec(source)
    expect(declared, 'HOLDS_THE_SLOT not found').not.toBeNull()
    const fromComponent = new Set([...declared![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]))

    expect(fromComponent).toEqual(fromMigration)
  })

  it.each(['proposing', 'awaiting_cost_approval', 'running'])(
    'says the slot is held while a run is %s',
    (status) => {
      render(<RunHistory runs={[run(status)] as never} />)
      expect(screen.getByText(SENTENCE)).toBeTruthy()
    },
  )

  it.each(['completed', 'nothing_to_do', 'cancelled', 'failed'])(
    'stays quiet once the run is %s, because the slot is free again',
    (status) => {
      render(<RunHistory runs={[run(status)] as never} />)
      // The claim must be ABSENT, not merely un-asserted: telling somebody the
      // schedule is blocked when it is not is the same defect pointing the
      // other way.
      expect(screen.queryByText(SENTENCE)).toBeNull()
    },
  )
})
