import { guardedFetch } from '@sahoda/research'
import {
  diffSnapshots,
  extractPrices,
  normalizePageText,
  readablePageText,
  type RadarSnapshotPayload,
  type SnapshotForDiff,
  type WithCreditsFn,
} from '@sahoda/shared'

import { chargeSubscribers, scanWeekKey, type ScanSeen } from './charge'
import { cheapCheck, contentHashOf, type FetchLike } from './cheap-check'
import type { DueSource, RadarDb } from './db'
import { APIFY_PROFILE_ESTIMATE_MICROS, fetchInstagramProfile } from './providers/apify'
import { TINYFISH_RENDER_ESTIMATE_MICROS, tinyfishFetch } from './providers/tinyfish'
import { isRefusal, withSpend } from './spend'

/**
 * ONE NIGHT'S RADAR PASS.
 *
 * ── THE LADDER, AND WHY IT IS SHAPED THIS WAY ────────────────────────────────
 * For a website:
 *
 *   1. A CONDITIONAL GET FROM OUR OWN SERVER. Costs nothing. If the site answers
 *      304, or the words hash the same, we are done for the night and no provider
 *      was involved at all.
 *   2. IF THE PAGE MOVED — we already have it. The bytes came back with the check.
 *      There is nothing left to pay for, and the naive design that "renders on
 *      change" would have paid here for a second copy of what it already held.
 *   3. ONLY IF WE COULD NOT SEE THE PAGE — a bot wall, a 403, a JavaScript shell —
 *      does the rendered fetch run, and only then does TinyFish appear.
 *
 * For a social account there is no free rung: no platform will show a stranger's
 * account to a plain HTTP request, so the check is the purchase. That is why
 * social is the entire cost of this feature and web is nearly free.
 *
 * ── WHAT THIS FUNCTION WILL NOT DO ───────────────────────────────────────────
 * Reach a model. Not once, on any path. Whether something changed is decided by
 * `diffSnapshots`, which is arithmetic over two payloads — so a competitor's page
 * can address whatever machine is reading it all it likes and there is no prompt
 * for it to address. See src/radar/untrusted.test.ts.
 *
 * ── AND THE REPORT IS THREE BUCKETS, NEVER TWO ───────────────────────────────
 * `unchanged`, `changed` and `couldNotCheck`. A pass that reported only the first
 * two would fold every failure into "nothing happened", which is the one sentence
 * this feature must never say by accident.
 */

export interface RadarPassOptions {
  db: RadarDb
  /**
   * The PROVIDER transport — Apify and TinyFish, both fixed hosts we own the URL of.
   * Injected so the whole pass is executable without a network.
   *
   * This is deliberately NOT the transport a competitor's page is read with. See
   * `fetchPage`.
   */
  fetch: FetchLike
  /**
   * The transport for a COMPETITOR-SUPPLIED URL, which is the only untrusted
   * address in this pass — and it defaults to the guarded one.
   *
   * ⚠ THE DEFECT THIS FIELD EXISTS TO CLOSE ⚠
   * `scripts/radar-pass.ts` passed `globalThis.fetch` as the single transport,
   * and `cheapCheck` asked it for `redirect: 'follow'`. So any signed-in account
   * could add `http://169.254.169.254/latest/meta-data/` as a competitor and have
   * this server read its own cloud credentials into a snapshot row, nightly. The
   * plain dotted quad was enough; no encoding trick was needed. Splitting the two
   * transports is what makes the guard un-bypassable by omission: a caller that
   * says nothing gets `guardedFetch`, and reaching a private address requires
   * naming this field on purpose.
   *
   * It cannot be a check at the door instead. A source is typed once and fetched
   * for months, and the DNS record behind a stored hostname is free to change in
   * between — so the only honest place to decide is the socket, on the night.
   */
  fetchPage?: FetchLike
  apifyToken?: string
  tinyfishApiKey?: string
  /**
   * The credit wrapper, and it is REQUIRED on purpose.
   *
   * /radar tells a shop owner "One scan per business per week, at 5 credits
   * each"; until this field existed the pass wrote no ledger row at all and
   * that price was a number nobody was ever debited. Optional, it would have
   * been the same defect with a seam: a caller that said nothing would scan for
   * free and look correct. Required, a runner that cannot reach the ledger
   * cannot start a pass — which is the honest failure.
   *
   * `chargeSubscribers` holds before the read and RELEASES on a page that would
   * not load, so "a page that will not load is skipped and not charged" stays
   * true.
   */
  withCredits: WithCreditsFn
  /** How many sources to look at. A wall, not a target. */
  batch?: number
  now?: () => Date
}

export interface RadarPassReport {
  considered: number
  unchanged: number
  changed: number
  couldNotCheck: number
  /** Sources not looked at because the cap said stop, and why. */
  refused: Array<{ sourceId: string; reason: string }>
  snapshotsWritten: number
  changesWritten: number
  /** Split by basis, because adding an estimate to a measurement is not a total. */
  spendMicros: { measured: number; estimated: number; free: number }
  /** Free checks as a share of everything attempted — the cheap-check hit rate. */
  freeCheckRate: number
  /**
   * What the CUSTOMER was charged, which is a different ledger from
   * `spendMicros` (what Sahoda paid a provider). `unpaid` counts workspaces
   * whose wallet was short: they were skipped, never held and never charged.
   */
  credits: { debited: number; unpaid: number }
}

const emptyReport = (): RadarPassReport => ({
  considered: 0,
  unchanged: 0,
  changed: 0,
  couldNotCheck: 0,
  refused: [],
  snapshotsWritten: 0,
  changesWritten: 0,
  spendMicros: { measured: 0, estimated: 0, free: 0 },
  freeCheckRate: 0,
  credits: { debited: 0, unpaid: 0 },
})

export async function runRadarPass(options: RadarPassOptions): Promise<RadarPassReport> {
  const now = options.now ?? (() => new Date())
  const report = emptyReport()
  const sources = await options.db.dueSources(options.batch ?? 100)
  report.considered = sources.length

  const week = scanWeekKey(now())

  for (const source of sources) {
    try {
      // WHO PAYS, before anything is read. One source, any number of watching
      // workspaces, one price each.
      const workspaces = await options.db.subscribers(source.sourceId)
      const outcome = await chargeSubscribers({
        withCredits: options.withCredits,
        workspaces,
        competitorId: source.competitorId,
        week,
        scan: () => scanSource(source, options, report, now),
      })

      report.credits.debited += outcome.debited.length
      report.credits.unpaid += outcome.unpaid.length

      if (outcome.scan === 'threw') {
        // One competitor's bad night must not end the pass. Classified, counted,
        // and the source stays unseen so next week retries it.
        //
        // A throw inside `withSpend` has ALREADY settled its reservation as
        // could_not_check, so the gap is in the fetch log either way; this counter
        // is the pass's own tally, not the record. Every hold taken for this
        // source has been released by the wrapper.
        report.couldNotCheck += 1
      } else if (outcome.scan === 'not_run' && workspaces.length > 0) {
        // NOBODY could pay, so the page was never fetched. That is a refusal and
        // NOT a gap: "we could not read it" would be a claim about the
        // competitor's website, and nothing was tried.
        const reason = outcome.unpaid.length > 0 ? 'CREDIT_INSUFFICIENT' : 'LEDGER_UNAVAILABLE'
        report.refused.push({ sourceId: source.sourceId, reason })
        await recordAttempt(source, `skipped: ${reason}`, options)
      }
    } catch (error) {
      // The subscriber read itself, or a throw the charge did not own.
      report.couldNotCheck += 1
      void error
    }
  }

  const attempted = report.unchanged + report.changed + report.couldNotCheck
  report.freeCheckRate = attempted === 0 ? 0 : (report.unchanged + report.changed) / attempted
  return report
}

/**
 * ONE SOURCE, READ ONCE.
 *
 * Called from inside `chargeSubscribers`, which memoises it: however many
 * workspaces are paying for this competitor, the page is fetched once and every
 * payer settles against the same answer. The return value is the ONLY thing the
 * charge looks at — `seen` DEBITs, anything else RELEASES — so it says what
 * happened to the read and nothing about money.
 */
async function scanSource(
  source: DueSource,
  options: RadarPassOptions,
  report: RadarPassReport,
  now: () => Date,
): Promise<ScanSeen> {
  if (source.kind === 'website') return checkWebsite(source, options, report, now)
  if (source.kind === 'instagram') return checkInstagram(source, options, report, now)
  // x / linkedin / facebook have no adapter yet. Recorded as a GAP rather than
  // skipped silently — "Radar does not cover this yet" and "nothing happened
  // there" must not look the same on the screen.
  await recordGap(source, `no adapter for ${source.kind}`, options, report)
  return 'not_seen'
}

/**
 * Write down that we did NOT manage to look, for the cases that never reach a
 * provider at all.
 *
 * ── WHY THIS FUNCTION EXISTS, AND HOW IT WAS FOUND ───────────────────────────
 * MEASURED on the first real pass against production: it reported one gap, and
 * `radar_fetch_log` held ZERO rows with `outcome = 'could_not_check'`. The
 * missing-provider path returned early, before taking a reservation, so nothing
 * was recorded — and the gap was invisible in the very table whose stated job is
 * to make gaps visible. The pass's in-memory counter knew; the database did not,
 * and the database is what the screen reads.
 *
 * A reservation at zero micros is the right shape: it costs nothing, it cannot be
 * refused for price, and it leaves the same row every other kind of failure
 * leaves. NO_SUBSCRIBERS is the one refusal that can still come back, and it is
 * correct to write nothing then — nobody is waiting for the answer.
 */
async function recordGap(
  source: DueSource,
  why: string,
  options: RadarPassOptions,
  report: RadarPassReport,
): Promise<void> {
  report.couldNotCheck += 1
  await options.db.rememberCheck(source.sourceId, source, false)
  await recordAttempt(source, why, options)
}

/**
 * WE BOTHERED THIS SOURCE TONIGHT — the bare fact, with no claim attached.
 *
 * ⚠ THE STARVATION THIS CLOSES, WHICH THE FIRST FIX RE-OPENED ⚠
 * `dueSources` now orders by the last ATTEMPT, and the attempt is
 * `radar_fetch_log`. A source whose subscribers all failed to pay never reached
 * `scanSource`, so it took no reservation, wrote no log row and left
 * `last_seen_at` NULL — which sorts FIRST, every pass, for ever. One workspace
 * with an empty wallet watching 100 competitors would have held the whole weekly
 * batch and no other tenant's competitor would have been read again: the exact
 * defect the ordering was changed to fix, with a far more ordinary cause than a
 * pasted list of dead hostnames. Whatever the pass decides about a source, it
 * writes down that it looked at it.
 *
 * The reservation is zero micros: it costs nothing, cannot be refused for price,
 * and leaves the same row every other outcome leaves.
 *
 * ⚠ AND THE OUTCOME WORD IS WRONG FOR THE SKIP CASE, KNOWINGLY ⚠
 * `radar_fetch_log.outcome` is CHECKed to
 * (pending | unchanged | changed | could_not_check), so "we did not try, because
 * nobody could pay" has to be filed as `could_not_check`. That word overstates
 * it — we never asked the website anything. It is tolerable ONLY because the
 * table is service-role-only and no customer-facing query reads it (see
 * `apps/web/src/lib/radar/store.ts`, which states three times that it does not),
 * so no screen inherits the wrong claim; `detail.why` carries the real one and
 * `report.refused` keeps the two apart in the pass's own answer. A `skipped`
 * value on the CHECK is owed to packages/db.
 */
async function recordAttempt(
  source: DueSource,
  why: string,
  options: RadarPassOptions,
): Promise<void> {
  await withSpend(
    options.db,
    {
      sourceId: source.sourceId,
      mode: 'cheap',
      provider: 'direct',
      estimateMicros: 0,
      costBasis: 'free',
    },
    async () => ({
      outcome: 'could_not_check' as const,
      costMicros: 0,
      costBasis: 'free' as const,
      detail: { why },
      value: null,
    }),
  )
}

// ── websites ─────────────────────────────────────────────────────────────────

async function checkWebsite(
  source: DueSource,
  options: RadarPassOptions,
  report: RadarPassReport,
  now: () => Date,
): Promise<ScanSeen> {
  const url = `https://${source.locator}/`

  // Rung 1 and 2. Reserved at zero micros so the attempt still appears in the
  // fetch log — a free check is still a check, and a night with none of them is
  // a night that did not run.
  const free = await withSpend(
    options.db,
    {
      sourceId: source.sourceId,
      mode: 'cheap',
      provider: 'direct',
      estimateMicros: 0,
      costBasis: 'free',
    },
    async () => {
      const result = await cheapCheck({
        url,
        memory: {
          etag: source.etag,
          lastModified: source.lastModified,
          contentHash: source.contentHash,
        },
        fetch: options.fetchPage ?? (guardedFetch as FetchLike),
      })
      return {
        outcome: result.outcome,
        costMicros: 0,
        costBasis: 'free' as const,
        detail: result.outcome === 'could_not_check' ? { why: result.why } : {},
        value: result,
      }
    },
  )

  if (isRefusal(free)) {
    // The cap said stop. Nothing was read, so nothing is charged.
    report.refused.push({ sourceId: source.sourceId, reason: free.reason })
    return 'not_seen'
  }

  const result = free.value
  if (result.outcome === 'unchanged') {
    report.unchanged += 1
    // Seen, and the validators refreshed — so tomorrow's check is free too.
    await options.db.rememberCheck(source.sourceId, result.memory, true)
    // A 304 IS a reading: we asked the site and it told us nothing had moved.
    // That is the scan the screen prices, and the cheapest possible one.
    return 'seen'
  }

  if (result.outcome === 'changed') {
    report.changed += 1
    await options.db.rememberCheck(source.sourceId, result.memory, true)
    await recordWebsite(source, url, result.html, options, report, now)
    return 'seen'
  }

  // Rung 3. The rendered fetch, only for the failures a residential proxy can
  // actually fix. Free per call since TinyFish replaced Zyte (2026-09-06), so
  // what it spends is one of the key's 1,000 daily fetches, not money.
  if (!result.escalate || !options.tinyfishApiKey) {
    // The free check already settled its own reservation as could_not_check with
    // the real reason, so the gap is on record. Only the counter is owed here.
    report.couldNotCheck += 1
    await options.db.rememberCheck(source.sourceId, source, false)
    return 'not_seen'
  }

  const paid = await withSpend(
    options.db,
    {
      sourceId: source.sourceId,
      mode: 'render',
      provider: 'tinyfish',
      estimateMicros: TINYFISH_RENDER_ESTIMATE_MICROS,
      // Zero, and 'free' says why on the row. See providers/tinyfish.ts.
      costBasis: 'free',
    },
    async () => {
      const rendered = await tinyfishFetch(url, { apiKey: options.tinyfishApiKey! })
      return {
        outcome: 'changed' as const,
        costMicros: TINYFISH_RENDER_ESTIMATE_MICROS,
        costBasis: 'free' as const,
        detail: { escalatedFrom: result.why },
        value: rendered,
      }
    },
  )

  if (isRefusal(paid)) {
    report.refused.push({ sourceId: source.sourceId, reason: paid.reason })
    report.couldNotCheck += 1
    return 'not_seen'
  }

  report.changed += 1
  report.spendMicros.free += TINYFISH_RENDER_ESTIMATE_MICROS
  const hash = contentHashOf(normalizePageText(paid.value.html))
  await options.db.rememberCheck(
    source.sourceId,
    { etag: null, lastModified: null, contentHash: hash },
    true,
  )
  await recordWebsite(source, url, paid.value.html, options, report, now)
  return 'seen'
}

async function recordWebsite(
  source: DueSource,
  url: string,
  html: string,
  options: RadarPassOptions,
  report: RadarPassReport,
  now: () => Date,
): Promise<void> {
  const flattened = normalizePageText(html)
  // Readable for the payload, flattened for the hash. Two jobs — see the note on
  // `readablePageText`; using one string for both silently disarmed the
  // quarantine wrapper's forged-turn defence.
  const readable = readablePageText(html)
  const title = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)?.[1]?.trim()

  const payload: RadarSnapshotPayload = {
    kind: 'website',
    url,
    ...(title ? { title } : {}),
    wordCount: flattened.split(' ').filter(Boolean).length,
    text: readable.slice(0, 20_000),
    prices: extractPrices(flattened),
  }

  await commit(source, payload, contentHashOf(flattened), options, report, now)
}

// ── social ───────────────────────────────────────────────────────────────────

async function checkInstagram(
  source: DueSource,
  options: RadarPassOptions,
  report: RadarPassReport,
  now: () => Date,
): Promise<ScanSeen> {
  if (!options.apifyToken) {
    await recordGap(source, 'APIFY_TOKEN absent', options, report)
    return 'not_seen'
  }

  const paid = await withSpend(
    options.db,
    {
      sourceId: source.sourceId,
      mode: 'render',
      provider: 'apify',
      estimateMicros: APIFY_PROFILE_ESTIMATE_MICROS,
      costBasis: 'measured',
    },
    async () => {
      const fetched = await fetchInstagramProfile(source.locator, {
        token: options.apifyToken!,
        fetch: options.fetch as never,
      })
      return {
        // Whether anything MOVED is decided by the differ, not here. 'changed'
        // means "we obtained content"; the fetch log records the transaction and
        // competitor_changes records the finding.
        outcome: 'changed' as const,
        // Null means the charge had not been accounted yet. The reservation's
        // list price stands, and the basis drops to 'estimated' so the founder's
        // report never counts a guess as a measurement.
        costMicros: fetched.costMicros ?? APIFY_PROFILE_ESTIMATE_MICROS,
        costBasis: (fetched.costMicros === null ? 'estimated' : 'measured') as
          'estimated' | 'measured',
        detail: { runId: fetched.runId },
        value: fetched,
      }
    },
  )

  if (isRefusal(paid)) {
    report.refused.push({ sourceId: source.sourceId, reason: paid.reason })
    return 'not_seen'
  }

  report.changed += 1
  const micros = paid.value.costMicros ?? APIFY_PROFILE_ESTIMATE_MICROS
  if (paid.value.costMicros === null) report.spendMicros.estimated += micros
  else report.spendMicros.measured += micros

  await options.db.rememberCheck(
    source.sourceId,
    { etag: null, lastModified: null, contentHash: null },
    true,
  )
  await commit(
    source,
    paid.value.snapshot,
    contentHashOf(JSON.stringify(paid.value.snapshot)),
    options,
    report,
    now,
  )
  return 'seen'
}

// ── the shared tail: store, then derive ──────────────────────────────────────

/**
 * Write today's snapshot and derive what moved since the last one.
 *
 * The order matters and it is the honest one: the SNAPSHOT is stored first and
 * unconditionally, then the change is worked out from two stored rows. Nothing
 * writes a change it has not got both sides of on disk, so every claim on the
 * screen can be traced to two records a founder can be shown.
 */
async function commit(
  source: DueSource,
  payload: RadarSnapshotPayload,
  contentHash: string,
  options: RadarPassOptions,
  report: RadarPassReport,
  now: () => Date,
): Promise<void> {
  const written = await options.db.insertSnapshot({
    sourceId: source.sourceId,
    payload,
    contentHash,
    capturedAt: now().toISOString(),
  })
  // Null means today already had a snapshot — a second run of the same night.
  // Correct, and deliberately not an error.
  if (!written) return
  report.snapshotsWritten += 1

  const previous = await options.db.previousSnapshot(source.sourceId, written.capturedOn)
  if (!previous) return // The first sighting. There is nothing to compare it to.

  const from: SnapshotForDiff = {
    id: previous.id,
    capturedOn: previous.capturedOn,
    payload: previous.payload as RadarSnapshotPayload,
  }
  const to: SnapshotForDiff = { id: written.id, capturedOn: written.capturedOn, payload }

  for (const change of diffSnapshots(from, to)) {
    await options.db.insertChange({
      fromSnapshotId: from.id,
      toSnapshotId: to.id,
      changeKind: change.changeKind,
      summary: change.summary,
      detail: change.detail,
    })
    report.changesWritten += 1
  }
}
