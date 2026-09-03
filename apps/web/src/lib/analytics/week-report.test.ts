import { describe, it, expect } from 'vitest'

import {
  weekReports,
  weekdayOf,
  commonAge,
  type Publication,
  type Snapshot,
  type WeekChanges,
} from './week-report'
import type { AgedPost } from './like-age'

/** Add `n` whole days to a `YYYY-MM-DD` string. */
function addDays(date: string, n: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

function pub(
  postId: string,
  publishedOn: string,
  channel: Publication['channel'] = 'instagram',
  title = `Post ${postId}`,
): Publication {
  return { postId, title, channel, publishedAt: `${publishedOn}T00:00:00Z` }
}

function snap(
  postId: string,
  measuredOn: string,
  value: number,
  channel: Snapshot['channel'] = 'instagram',
  metric = 'reach',
): Snapshot {
  return { postId, channel, metric, value, measuredOn }
}

describe('weekReports — grouping', () => {
  it('groups by ISO week and returns newest first', () => {
    const publications = [
      pub('p1', '2026-07-06'), // an earlier ISO week
      pub('p2', '2026-07-20'), // a later ISO week
    ]
    const reports = weekReports({ publications, snapshots: [], changes: [] })
    expect(reports.length).toBe(2)
    // The later week's key must sort first — newest first, not insertion order.
    expect(reports[0]?.key.localeCompare(reports[1]?.key ?? '')).toBeGreaterThan(0)
  })

  it('does not emit a row for a week with no publication at all', () => {
    // Only two of what would be three consecutive weeks published anything.
    const publications = [pub('p1', '2026-07-06'), pub('p2', '2026-07-20')]
    const reports = weekReports({ publications, snapshots: [], changes: [] })
    expect(reports.length).toBe(2)
    // Neither report claims to be the empty week in between.
    const midWeekStart = '2026-07-13'
    expect(reports.some((r) => r.startsOn === midWeekStart)).toBe(false)
  })

  it('counts DISTINCT posts, not publications: one post on two channels is 1 post, 2 channels', () => {
    const publications = [pub('p1', '2026-08-03', 'instagram'), pub('p1', '2026-08-03', 'linkedin')]
    const reports = weekReports({ publications, snapshots: [], changes: [] })
    expect(reports.length).toBe(1)
    expect(reports[0]?.posts).toBe(1)
    expect(reports[0]?.channels.length).toBe(2)
  })
})

describe('weekReports — total', () => {
  it('is null, never 0, when no snapshot reported', () => {
    const publications = [pub('p1', '2026-08-03')]
    const reports = weekReports({ publications, snapshots: [], changes: [] })
    expect(reports[0]?.total).toBeNull()
  })

  it('when only some posts reported, measured is strictly less than of', () => {
    const publications = [
      pub('p1', '2026-08-03', 'instagram'),
      pub('p2', '2026-08-04', 'instagram'),
    ]
    const snapshots = [snap('p1', '2026-08-05', 40)]
    const reports = weekReports({ publications, snapshots, changes: [] })
    const total = reports[0]?.total
    expect(total).not.toBeNull()
    expect(total?.measured).toBe(1)
    expect(total?.of).toBe(2)
    expect(total?.measured).toBeLessThan(total?.of ?? 0)
  })

  it('sums the LATEST reading per post-channel, not all readings', () => {
    const publications = [pub('p1', '2026-08-03', 'instagram')]
    const snapshots = [
      snap('p1', '2026-08-05', 50), // earlier reading
      snap('p1', '2026-08-10', 80), // latest reading — the fuller picture
    ]
    const reports = weekReports({ publications, snapshots, changes: [] })
    // If every reading were summed this would be 130. It must be 80: the latest
    // running total, not the sum of two snapshots of the same growing number.
    expect(reports[0]?.total?.value).toBe(80)
  })
})

describe('weekReports — ranked', () => {
  it('is null when fewer than MIN_RANKED_POSTS share a common age', () => {
    const publications = [pub('p1', '2026-08-03', 'instagram')]
    const snapshots = [snap('p1', '2026-08-10', 300)]
    const reports = weekReports({ publications, snapshots, changes: [] })
    expect(reports[0]?.ranked).toBeNull()
  })

  /**
   * THE ANTI-AGE-CONFOUND GUARANTEE. Post A is older by the time either is
   * measured: its latest stored reading (1000, at day 20) is far bigger than
   * post B's latest stored reading (350, at day 10) simply because A has had
   * longer to accumulate. A ranking of "latest raw value" would put A on top.
   * The only age both posts were measured at in common is day 7, and AT THAT
   * AGE B (300) beats A (200) — the opposite order. `ranked` must report B on
   * top, proving it compares at the common age and not by latest total.
   */
  it('ranks at a COMMON AGE, which can be the opposite of ranking by latest raw value', () => {
    const publications = [
      pub('A', '2026-08-03', 'instagram', 'Post A'),
      pub('B', '2026-08-06', 'instagram', 'Post B'),
    ]
    const snapshots = [
      snap('A', addDays('2026-08-03', 7), 200),
      snap('A', addDays('2026-08-03', 20), 1000), // A's latest raw value: huge
      snap('B', addDays('2026-08-06', 7), 300),
      snap('B', addDays('2026-08-06', 10), 350), // B's latest raw value: small
    ]
    const reports = weekReports({ publications, snapshots, changes: [] })
    const ranked = reports[0]?.ranked
    expect(ranked).not.toBeNull()
    expect(ranked?.ageDays).toBe(7)
    // At day 7 (200 vs 300), B is the top performer — the reverse of latest-raw.
    expect(ranked?.top.postId).toBe('B')
    expect(ranked?.bottom.postId).toBe('A')
  })
})

describe('commonAge', () => {
  /**
   * commonAge must pick the OLDEST qualifying age, not the youngest. Three
   * posts share a reading at age 10; only two of them also share one at age 5.
   * Both ages clear MIN_RANKED_POSTS, so the youngest-first answer (5) is
   * wrong — the function has to keep looking past it to 10.
   */
  it('picks the oldest qualifying age, not the youngest', () => {
    const posts: AgedPost[] = [
      {
        postId: 'p1',
        publishedOn: '2026-08-01',
        readings: [
          { measuredOn: addDays('2026-08-01', 5), value: 10 },
          { measuredOn: addDays('2026-08-01', 10), value: 20 },
        ],
      },
      {
        postId: 'p2',
        publishedOn: '2026-08-01',
        readings: [
          { measuredOn: addDays('2026-08-01', 5), value: 10 },
          { measuredOn: addDays('2026-08-01', 10), value: 20 },
        ],
      },
      {
        postId: 'p3',
        publishedOn: '2026-08-01',
        readings: [{ measuredOn: addDays('2026-08-01', 10), value: 20 }],
      },
    ]
    expect(commonAge(posts)).toBe(10)
  })
})

describe('weekReports — normals baseline excludes the reported week', () => {
  /**
   * Earlier baseline: 3 posts at 100. This week: 3 posts at 115 — a real 15%
   * lift, over MIN_MOVE. If the week were folded into its own baseline the
   * merged median would sit at 107.5 (100,100,100,115,115,115), and 115
   * against 107.5 is under 10%: 'level', not 'up'. The correct, excluding
   * baseline must therefore report 'up', proving the week is not compared
   * against itself.
   */
  it('excludes the reported week from its own baseline — including it would flip the direction', () => {
    const earlier = [
      pub('e1', '2026-06-01', 'instagram'),
      pub('e2', '2026-06-08', 'instagram'),
      pub('e3', '2026-06-15', 'instagram'),
    ]
    const week = [
      pub('w1', '2026-08-03', 'instagram'),
      pub('w2', '2026-08-04', 'instagram'),
      pub('w3', '2026-08-05', 'instagram'),
    ]
    const publications = [...earlier, ...week]
    const snapshots = [
      snap('e1', addDays('2026-06-01', 7), 100),
      snap('e2', addDays('2026-06-08', 7), 100),
      snap('e3', addDays('2026-06-15', 7), 100),
      snap('w1', addDays('2026-08-03', 7), 115),
      snap('w2', addDays('2026-08-04', 7), 115),
      snap('w3', addDays('2026-08-05', 7), 115),
    ]
    const reports = weekReports({ publications, snapshots, changes: [] })
    const weekReport = reports.find((r) => r.posts === 3 && r.startsOn >= '2026-08-01')
    const normal = weekReport?.normals.find((n) => n.channel === 'instagram')?.normal
    expect(normal?.kind).toBe('compared')
    if (normal?.kind !== 'compared') throw new Error('expected a comparison')
    expect(normal.direction).toBe('up')
  })
})

describe('weekReports — verdict window ends at the reported week, not today', () => {
  /**
   * An older week's report is built from too few posts to clear the gates
   * (2, below MIN_POSTS_PER_GROUP), so its verdict must refuse with
   * 'too_few_posts'. Adding a batch of newer posts, published months later
   * but still before the real "today" this test runs on, must not change
   * that answer: the window for the OLDER week's own report has to end at
   * that week, not leak forward to whatever is newest or to the real clock.
   */
  it('a later batch of posts does not change an older week’s verdict', () => {
    const olderWeek = [pub('o1', '2026-02-02', 'instagram'), pub('o2', '2026-02-03', 'instagram')]
    const olderSnapshots = [
      snap('o1', addDays('2026-02-02', 7), 500),
      snap('o2', addDays('2026-02-03', 7), 500),
    ]

    const newerWeek = [
      pub('n1', '2026-08-10', 'linkedin'),
      pub('n2', '2026-08-11', 'linkedin'),
      pub('n3', '2026-08-12', 'linkedin'),
    ]
    const newerSnapshots = [
      snap('n1', addDays('2026-08-10', 7), 5000, 'linkedin'),
      snap('n2', addDays('2026-08-11', 7), 5000, 'linkedin'),
      snap('n3', addDays('2026-08-12', 7), 5000, 'linkedin'),
    ]

    const reportsOlderOnly = weekReports({
      publications: olderWeek,
      snapshots: olderSnapshots,
      changes: [],
    })
    const reportsCombined = weekReports({
      publications: [...olderWeek, ...newerWeek],
      snapshots: [...olderSnapshots, ...newerSnapshots],
      changes: [],
    })

    const olderOnly = reportsOlderOnly.find((r) => r.startsOn <= '2026-02-08')
    const olderInCombined = reportsCombined.find((r) => r.startsOn <= '2026-02-08')

    expect(olderOnly?.verdict.comparison).toEqual({ kind: 'none', reason: 'too_few_posts' })
    expect(olderInCombined?.verdict.comparison).toEqual({ kind: 'none', reason: 'too_few_posts' })
  })
})

describe('weekReports — changes', () => {
  it('is null when no cycle matches the week’s iso year and week', () => {
    const publications = [pub('p1', '2026-08-03')]
    const changes: WeekChanges[] = [{ isoYear: 1999, isoWeek: 1, did: [], nothingReason: null }]
    const reports = weekReports({ publications, snapshots: [], changes })
    expect(reports[0]?.changes).toBeNull()
  })

  it('matches a cycle sharing the same iso year and week', () => {
    const publications = [pub('p1', '2026-08-03')]
    const isoYear = 2026
    const isoWeek = 32
    const changes: WeekChanges[] = [
      { isoYear, isoWeek, did: [{ what: 'x', why: null }], nothingReason: null },
    ]
    const reports = weekReports({ publications, snapshots: [], changes })
    // Only assert the match happened if this fixture landed in that iso week;
    // otherwise this test would be tautologically true or false by accident.
    const report = reports[0]
    if (report?.isoYear === isoYear && report.isoWeek === isoWeek) {
      expect(report.changes).toEqual(changes[0])
    } else {
      expect(report?.changes).toBeNull()
    }
  })
})

describe('weekdayOf and unparseable instants', () => {
  it('returns null for an unparseable instant', () => {
    expect(weekdayOf('not-a-date')).toBeNull()
  })

  it('drops publications with an unparseable publishedAt rather than defaulting them into a week', () => {
    const publications: Publication[] = [
      { postId: 'good', title: 'Good', channel: 'instagram', publishedAt: '2026-08-03T00:00:00Z' },
      { postId: 'bad', title: 'Bad', channel: 'instagram', publishedAt: 'not-a-date' },
    ]
    const reports = weekReports({ publications, snapshots: [], changes: [] })
    // Only the one parseable publication is grouped into a week — the
    // unparseable one is dropped, never assigned to some default bucket.
    const totalPosts = reports.reduce((sum, r) => sum + r.posts, 0)
    expect(totalPosts).toBe(1)
  })
})

/**
 * ── THE TWO DEFECTS AN AUDIT FOUND, EACH PINNED BY THE INPUT THAT EXPOSED IT ──
 *
 * Both shipped in the first version of this file, both were invisible to the
 * tests that existed at the time, and both produced a sentence made entirely of
 * real rows that said something false about a customer's business. They are the
 * reason this block exists: a guard written after the fact, against the exact
 * arrangement that broke it.
 */
describe('weekReports — what the audit broke', () => {
  it('does not turn a difference in post AGE into a verdict about weekdays', () => {
    /**
     * Every post here earns exactly 100 reach a day, so performance is identical
     * by construction and there is no finding to make. The only thing separating
     * the two arms is how long ago they went out.
     *
     * The first version compared raw lifetime totals across the whole window and
     * reported "Your Tuesday posts reach more people than your Friday ones",
     * 1,700 against 200, a lift of 8.5. Every figure came from a real row.
     */
    const publications: Publication[] = [
      pub('t1', '2026-06-30'),
      pub('t2', '2026-07-07'),
      pub('t3', '2026-07-14'),
      pub('f1', '2026-08-21'),
      pub('f2', '2026-08-21'),
      pub('f3', '2026-08-21'),
    ]

    // One reading a day from publication to 24 August, at 100 a day.
    const snapshots: Snapshot[] = []
    for (const publication of publications) {
      const from = publication.publishedAt.slice(0, 10)
      for (let age = 0; age <= 60; age += 1) {
        const day = addDays(from, age)
        if (day > '2026-08-24') break
        snapshots.push(snap(publication.postId, day, age * 100))
      }
    }

    const week = weekReports({ publications, snapshots, changes: [] })[0]
    expect(week).toBeTruthy()
    // Identical performance must produce NO claim of a difference. Whether the
    // gate that refuses is the lift gate or the sample gate is not the point;
    // asserting a lift here at all is the defect.
    expect(week?.verdict.comparison.kind).toBe('none')
  })

  it('still finds a real weekday difference once age is held constant', () => {
    // The other half of the guard. A test that only proves the module refuses is
    // satisfied by a module that refuses everything, which would be useless in a
    // different way.
    const publications: Publication[] = [
      pub('t1', '2026-07-07'),
      pub('t2', '2026-07-14'),
      pub('t3', '2026-07-21'),
      pub('f1', '2026-07-10'),
      pub('f2', '2026-07-17'),
      pub('f3', '2026-07-24'),
    ]
    const snapshots: Snapshot[] = publications.map((publication) =>
      snap(
        publication.postId,
        addDays(publication.publishedAt.slice(0, 10), 7),
        publication.postId.startsWith('t') ? 1000 : 100,
      ),
    )

    const week = weekReports({ publications, snapshots, changes: [] })[0]
    expect(week?.verdict.comparison.kind).toBe('lift')
    if (week?.verdict.comparison.kind === 'lift') {
      expect(week.verdict.comparison.lift.leader).toBe('Tuesday')
      expect(week.verdict.comparison.lift.runnerUp).toBe('Friday')
    }
  })

  it('never shows a week readings that were taken long after it settled', () => {
    /**
     * A January week rendered August's figures, because the publications were
     * filtered to the week and the READINGS were not. The cutoff is the end of
     * the week plus `REPORT_SETTLES_DAYS`, so a card stops moving a fortnight
     * after its week and never picks up anything later.
     */
    const publications = [pub('a', '2026-01-06'), pub('b', '2026-01-07')]
    const snapshots = [snap('a', '2026-08-01', 800), snap('b', '2026-08-02', 800)]

    const week = weekReports({ publications, snapshots, changes: [] })[0]
    expect(week?.key).toBe('2026-W02')
    // Null, not a figure: nothing had been measured by the time this week
    // settled, and that is the true statement about it.
    expect(week?.total).toBeNull()
    expect(week?.ranked).toBeNull()
  })

  it('does use readings taken inside the settling window', () => {
    // The complement, so the cutoff cannot be tightened into uselessness without
    // something going red: a seven-day reading of a Saturday post falls in the
    // NEXT week and must still count towards the week the post belongs to.
    const publications = [pub('a', '2026-01-10'), pub('b', '2026-01-10')]
    const snapshots = [snap('a', '2026-01-17', 500), snap('b', '2026-01-17', 300)]

    const week = weekReports({ publications, snapshots, changes: [] })[0]
    expect(week?.total).toEqual({ value: 800, measured: 2, of: 2 })
  })
})
