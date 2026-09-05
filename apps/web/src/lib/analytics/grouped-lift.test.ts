import { describe, it, expect } from 'vitest'

import {
  compareGroups,
  MIN_POSTS_PER_GROUP,
  MIN_LEADER_MEAN,
  MIN_MEASURED_DAYS,
  type GroupedObservation,
} from './grouped-lift'

const obs = (
  postId: string,
  group: string,
  value: number,
  measuredOn = '2026-08-18',
  metric = 'impressions',
): GroupedObservation => ({ postId, group, metric, value, measuredOn })

/**
 * n posts in one arm, all at the same value, spread across three days.
 *
 * Rotating over three days so a group clears `MIN_MEASURED_DAYS` by default —
 * `reflect.test.ts` learned this the hard way: fixtures pinned to one day looked
 * like they were testing the lift or the leader-mean gate and were actually
 * testing the day floor instead. `day` stays available for tests that are
 * deliberately ABOUT the window.
 */
function arm(group: string, n: number, value: number, day?: string): GroupedObservation[] {
  const WINDOW = ['2026-08-18', '2026-08-19', '2026-08-20']
  return Array.from({ length: n }, (_, i) =>
    obs(`${group}-${i}`, group, value, day ?? (WINDOW[i % WINDOW.length] as string)),
  )
}

describe('compareGroups — the honest-empty paths, each a different reason', () => {
  it('says no_history when nothing was ever measured', () => {
    const r = compareGroups([])
    expect(r).toEqual({ kind: 'none', reason: 'no_history' })
  })

  it('says too_few_posts when the input holds only a metric nobody asked about', () => {
    // The whole input is non-empty, so this must NOT read as no_history — the
    // workspace has history, just not for this metric.
    const rows = arm('tuesday', 4, 400).map((o) => ({ ...o, metric: 'reach' }))
    const r = compareGroups(rows, 'impressions')
    expect(r).toEqual({ kind: 'none', reason: 'too_few_posts' })
  })

  it('says too_few_posts when every arm is under MIN_POSTS_PER_GROUP', () => {
    const rows = [...arm('tuesday', 2, 400), ...arm('friday', 2, 100)]
    const r = compareGroups(rows)
    expect(r).toEqual({ kind: 'none', reason: 'too_few_posts' })
  })

  it('says single_group when only one arm clears the post floor', () => {
    const rows = [...arm('tuesday', MIN_POSTS_PER_GROUP, 400), ...arm('friday', 1, 900)]
    const r = compareGroups(rows)
    expect(r).toEqual({ kind: 'none', reason: 'single_group' })
  })

  it('says too_few_days when both arms clear the post floor but all evidence is one day', () => {
    const rows = [
      ...arm('tuesday', MIN_POSTS_PER_GROUP, 400, '2026-08-18'),
      ...arm('friday', MIN_POSTS_PER_GROUP, 100, '2026-08-18'),
    ]
    const r = compareGroups(rows)
    expect(r).toEqual({ kind: 'none', reason: 'too_few_days' })
  })

  it('says numbers_too_small when the leader mean is under MIN_LEADER_MEAN', () => {
    // 3-against-1 clears any lift ratio and is still two tiny numbers.
    const rows = [...arm('tuesday', 4, 3), ...arm('friday', 4, 1)]
    const r = compareGroups(rows)
    expect(r).toEqual({ kind: 'none', reason: 'numbers_too_small' })
  })

  it('says difference_too_small when the leader is big enough but the gap is inside the noise', () => {
    const rows = [...arm('tuesday', 4, 100), ...arm('friday', 4, 90)]
    const r = compareGroups(rows)
    expect(r).toEqual({ kind: 'none', reason: 'difference_too_small' })
  })

  it('returns a clean lift when every gate clears', () => {
    const rows = [...arm('tuesday', 4, 400), ...arm('friday', 4, 100)]
    const r = compareGroups(rows)
    expect(r.kind).toBe('lift')
    if (r.kind !== 'lift') throw new Error('expected a lift')
    expect(r.lift.leader).toBe('tuesday')
    expect(r.lift.runnerUp).toBe('friday')
    expect(r.lift.leaderMean).toBe(400)
    expect(r.lift.runnerUpMean).toBe(100)
    expect(r.lift.lift).toBe(4)
    expect(r.lift.sampleSize).toBe(8)
    expect(r.lift.windowDays).toBe(3)
    expect(r.lift.leaderPosts).toBe(4)
    expect(r.lift.runnerUpPosts).toBe(4)
  })
})

describe('gate order', () => {
  /**
   * Too few posts AND one day, both true at once. Only one reason is returned,
   * and it must be the posts — waiting for more days does not help someone who
   * has not published enough, and telling them to wait would be the wrong
   * instruction, same argument `reflect.test.ts` makes for the channel gates.
   */
  it('reports too_few_posts over too_few_days when both are true', () => {
    const rows = [obs('a', 'tuesday', 400, '2026-08-18'), obs('b', 'friday', 100, '2026-08-18')]
    const r = compareGroups(rows)
    expect(r).toEqual({ kind: 'none', reason: 'too_few_posts' })
  })
})

describe('counting rules', () => {
  it('counts a post measured on many days as ONE post, not several', () => {
    // Two posts, each measured on four separate days: eight rows, two posts —
    // one below the floor for this arm. If dailies counted as posts this would
    // read as eight and clear.
    const daily = ['a', 'b'].flatMap((p) =>
      ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19'].map((d) =>
        obs(p, 'tuesday', 400, d),
      ),
    )
    // Friday also below the floor, so neither arm becomes eligible and the
    // reason is unambiguously too_few_posts rather than single_group.
    const r = compareGroups([...daily, ...arm('friday', MIN_POSTS_PER_GROUP - 1, 100)])
    expect(r).toEqual({ kind: 'none', reason: 'too_few_posts' })
  })

  /**
   * A group label containing a space. A naive `group + ' ' + postId` string key
   * collapses `('Tuesday', 'morning-1')` and `('Tuesday morning', 'ing-1')`
   * into the identical joined string `"Tuesday morning-1"` — two different
   * posts, on two different arms, merged into one bucket under one key.
   */
  it('does not let a group label with a space collide with another post under a naive join', () => {
    const rows: GroupedObservation[] = [
      // 'Tuesday' + ' ' + 'morning-1' === 'Tuesday morning-1'
      ...arm('Tuesday', MIN_POSTS_PER_GROUP - 1, 900, '2026-08-18'),
      obs('morning-1', 'Tuesday', 900, '2026-08-19'),
      // 'Tuesday morning' + ' ' + 'ing-1' === 'Tuesday morning-1' — SAME joined key
      ...arm('Tuesday morning', MIN_POSTS_PER_GROUP, 400),
      ...arm('Friday', MIN_POSTS_PER_GROUP, 100),
    ]
    const r = compareGroups(rows)
    expect(r.kind).toBe('lift')
    if (r.kind !== 'lift') throw new Error('expected a lift')
    // If the two posts named 'morning-1' / 'ing-1' collided under the joined
    // key, 'Tuesday' would show MIN_POSTS_PER_GROUP posts (it should) but one
    // of its rows would actually belong to 'Tuesday morning', pulling
    // 'Tuesday's mean toward 900 from a post that never happened there. Both
    // arms must keep their own, undiluted mean and their own post count.
    expect(r.lift.leader).toBe('Tuesday')
    expect(r.lift.leaderMean).toBe(900)
    expect(r.lift.leaderPosts).toBe(MIN_POSTS_PER_GROUP)
    expect(r.lift.runnerUp).toBe('Tuesday morning')
    expect(r.lift.runnerUpMean).toBe(400)
    expect(r.lift.runnerUpPosts).toBe(MIN_POSTS_PER_GROUP)
  })

  it('reports leaderPosts and runnerUpPosts as each arm alone, not the sum', () => {
    const rows = [...arm('tuesday', 5, 400), ...arm('friday', 3, 100)]
    const r = compareGroups(rows)
    expect(r.kind).toBe('lift')
    if (r.kind !== 'lift') throw new Error('expected a lift')
    expect(r.lift.leaderPosts).toBe(5)
    expect(r.lift.runnerUpPosts).toBe(3)
    expect(r.lift.sampleSize).toBe(8)
  })
})

describe('deterministic ties', () => {
  /**
   * A clear leader, and two runner-up candidates tied for second place. An
   * unstable sort would let either win depending on Map iteration order, and
   * that instability would be a claim ("Zeta beats Alpha") that changes on
   * reload with the exact same rows behind it.
   */
  it('breaks a tie between two arms with equal means by group name, the same way every time', () => {
    const rows = [...arm('top', 4, 400), ...arm('zeta', 4, 100), ...arm('alpha', 4, 100)]
    const first = compareGroups(rows)
    const second = compareGroups(rows)
    expect(first.kind).toBe('lift')
    expect(second.kind).toBe('lift')
    if (first.kind !== 'lift' || second.kind !== 'lift') throw new Error('expected lifts')
    // 'alpha' sorts before 'zeta', so alpha is the runner-up despite an
    // identical mean to zeta's.
    expect(first.lift.runnerUp).toBe('alpha')
    expect(second.lift.runnerUp).toBe('alpha')
    expect(first.lift.runnerUp).toBe(second.lift.runnerUp)
  })
})

describe('MIN_MEASURED_DAYS floor, directly', () => {
  it('refuses at two distinct days', () => {
    const rows = [
      ...arm('tuesday', MIN_POSTS_PER_GROUP, 400, '2026-08-18'),
      ...arm('friday', MIN_POSTS_PER_GROUP, 100, '2026-08-19'),
    ]
    expect(compareGroups(rows)).toEqual({ kind: 'none', reason: 'too_few_days' })
  })

  it('allows the comparison the moment a third day is measured', () => {
    const rows = [...arm('tuesday', 4, 400), ...arm('friday', 4, 100)]
    const r = compareGroups(rows)
    expect(r.kind).toBe('lift')
    if (r.kind !== 'lift') throw new Error('expected a lift')
    expect(r.lift.windowDays).toBe(MIN_MEASURED_DAYS)
  })
})

describe('MIN_LEADER_MEAN, directly', () => {
  it('accepts a leader mean exactly on the floor when the lift also clears', () => {
    const rows = [...arm('tuesday', 4, MIN_LEADER_MEAN), ...arm('friday', 4, 1)]
    const r = compareGroups(rows)
    expect(r.kind).toBe('lift')
  })
})

describe('does not divide by zero when the runner-up measured nothing', () => {
  it('produces no learning rather than an infinite one', () => {
    const rows = [...arm('tuesday', 4, MIN_LEADER_MEAN * 10), ...arm('friday', 4, 0)]
    const r = compareGroups(rows)
    // ratio is set to 1 (not Infinity) when the runner-up mean is 0, so this is
    // a difference_too_small refusal, never a crash or a fabricated lift.
    expect(r).toEqual({ kind: 'none', reason: 'difference_too_small' })
  })
})
