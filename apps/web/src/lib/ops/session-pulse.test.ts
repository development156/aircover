import { describe, expect, it } from 'vitest'
import type { OpsQaRun, OpsSession } from '@sahoda/shared'

import {
  formatIst,
  gateChips,
  pulseOf,
  redSuitesFrom,
  relativeAge,
  HEARTBEAT_WINDOW_MS,
} from './session-pulse'

const NOW = new Date('2026-07-26T10:00:00Z')

function session(over: Partial<OpsSession> & Pick<OpsSession, 'session_id'>): OpsSession {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    label: null,
    tasks_touched: [],
    status: 'working',
    started_at: '2026-07-26T09:00:00Z',
    last_heartbeat_at: '2026-07-26T09:59:30Z',
    created_at: '2026-07-26T09:00:00Z',
    updated_at: '2026-07-26T09:59:30Z',
    ...over,
  }
}

function run(over: Partial<OpsQaRun> & Pick<OpsQaRun, 'suite' | 'status'>): OpsQaRun {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    task_code: null,
    kind: 'auto',
    summary_plain: null,
    details: null,
    actor: 'claude',
    duration_ms: null,
    started_at: '2026-07-26T09:58:00Z',
    finished_at: '2026-07-26T09:58:20Z',
    created_at: '2026-07-26T09:58:20Z',
    updated_at: '2026-07-26T09:58:20Z',
    ...over,
  }
}

describe('pulseOf', () => {
  it('is working when the status says so AND the heartbeat is fresh', () => {
    const pulse = pulseOf([session({ session_id: 'local:wt-admin', label: 'wt-admin' })], NOW)

    expect(pulse.state).toBe('working')
    expect(pulse).toMatchObject({ label: 'wt-admin' })
  })

  it('is idle when a `working` row has gone quiet past the window', () => {
    // The failure this prevents: a crashed session, or a slept laptop, leaves
    // `working` written in the row forever. A pulse that keeps beating for a
    // dead process is a green test that never ran.
    const stale = session({
      session_id: 'x',
      last_heartbeat_at: new Date(NOW.getTime() - HEARTBEAT_WINDOW_MS - 1000).toISOString(),
    })

    expect(pulseOf([stale], NOW).state).toBe('idle')
  })

  it('reports idle since the most recent heartbeat of ANY session', () => {
    const pulse = pulseOf(
      [
        session({ session_id: 'old', status: 'ended', last_heartbeat_at: '2026-07-26T08:00:00Z' }),
        session({ session_id: 'new', status: 'idle', last_heartbeat_at: '2026-07-26T09:30:00Z' }),
      ],
      NOW,
    )

    expect(pulse).toEqual({ state: 'idle', since: '2026-07-26T09:30:00Z' })
  })

  it('prefers the freshest heartbeat when two sessions are live', () => {
    const pulse = pulseOf(
      [
        session({ session_id: 'a', label: 'a', last_heartbeat_at: '2026-07-26T09:59:00Z' }),
        session({ session_id: 'b', label: 'b', last_heartbeat_at: '2026-07-26T09:59:50Z' }),
      ],
      NOW,
    )

    expect(pulse).toMatchObject({ label: 'b' })
  })

  it('falls back to the session id when a session carries no label', () => {
    expect(pulseOf([session({ session_id: 'local:wt-db' })], NOW)).toMatchObject({
      label: 'local:wt-db',
    })
  })

  it('distinguishes "nothing has ever run here" from "idle"', () => {
    expect(pulseOf([], NOW)).toEqual({ state: 'never' })
  })

  it('treats an unparseable heartbeat as ancient, not as now', () => {
    expect(pulseOf([session({ session_id: 'x', last_heartbeat_at: 'nonsense' })], NOW).state).toBe(
      'idle',
    )
  })
})

describe('gateChips', () => {
  const SUITES = ['typecheck', 'lint', 'unit', 'rls', 'smoke']

  it('marks a suite that never ran `never`, not green', () => {
    // The entire reason the strip exists: "we have no evidence" and "it passed"
    // are different claims and only one is safe to act on.
    const chips = gateChips(SUITES, {
      typecheck: run({ suite: 'typecheck', status: 'pass' }),
      lint: null,
      unit: null,
      rls: null,
      smoke: null,
    })

    expect(chips.map((c) => c.state)).toEqual(['pass', 'never', 'never', 'never', 'never'])
    expect(chips[1]!.at).toBeNull()
  })

  it('carries the run time so a stale pass cannot pose as a fresh one', () => {
    const chips = gateChips(['unit'], { unit: run({ suite: 'unit', status: 'pass' }) })
    expect(chips[0]!.at).toBe('2026-07-26T09:58:20Z')
  })

  it('falls back to started_at when a run never recorded a finish', () => {
    const chips = gateChips(['unit'], {
      unit: run({ suite: 'unit', status: 'running', finished_at: null }),
    })

    expect(chips[0]!.at).toBe('2026-07-26T09:58:00Z')
    expect(chips[0]!.state).toBe('running')
  })

  it('keeps the caller order, which is the order the strip renders', () => {
    expect(gateChips(SUITES, {}).map((c) => c.suite)).toEqual(SUITES)
  })
})

describe('redSuitesFrom', () => {
  it('reports only failures — never, running and blocked are not red', () => {
    const chips = gateChips(['typecheck', 'lint', 'unit', 'rls'], {
      typecheck: run({ suite: 'typecheck', status: 'fail' }),
      lint: null,
      unit: run({ suite: 'unit', status: 'running', finished_at: null }),
      rls: run({ suite: 'rls', status: 'blocked' }),
    })

    expect(redSuitesFrom(chips)).toEqual(['typecheck'])
  })
})

describe('relativeAge', () => {
  it.each([
    ['2026-07-26T09:59:40Z', 'just now'],
    ['2026-07-26T09:56:00Z', '4 min ago'],
    ['2026-07-26T07:00:00Z', '3 h ago'],
    ['2026-07-25T10:00:00Z', '1 day ago'],
    ['2026-07-24T10:00:00Z', '2 days ago'],
  ])('%s → %s', (at, expected) => {
    expect(relativeAge(at, NOW)).toBe(expected)
  })

  it('is null rather than a guess when there is no timestamp', () => {
    expect(relativeAge(null, NOW)).toBeNull()
    expect(relativeAge('nonsense', NOW)).toBeNull()
  })

  it('clamps a future timestamp to "just now" instead of negative time', () => {
    expect(relativeAge('2026-07-26T10:05:00Z', NOW)).toBe('just now')
  })
})

describe('formatIst', () => {
  it('renders doc 13 §8 format in IST, not UTC', () => {
    // 10:00 UTC is 15:30 IST. Rendering UTC makes every reader do arithmetic.
    expect(formatIst('2026-07-26T10:00:00Z')).toBe('26 Jul 2026 · 15:30')
  })

  it('rolls the date over correctly across the +5:30 offset', () => {
    expect(formatIst('2026-07-25T19:00:00Z')).toBe('26 Jul 2026 · 00:30')
  })

  it('is null for an absent or unparseable timestamp', () => {
    expect(formatIst(null)).toBeNull()
    expect(formatIst('nope')).toBeNull()
  })
})
