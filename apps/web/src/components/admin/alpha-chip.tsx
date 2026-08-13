import { OctagonAlert } from 'lucide-react'
import type { OpsRoadmapItem } from '@sahoda/shared'

import {
  ALPHA_GATE,
  GATE_STALE_AFTER_DAYS,
  ageLabel,
  gateAgeDays,
  shaDrift,
  shortSha,
  type AlphaAssessment,
  type AlphaGateRecord,
} from '@/lib/ops/alpha-gate'

/**
 * The Alpha readiness verdict, DEMOTED but not removed (SL-062 §1).
 *
 * It used to be a full crimson panel at the top of the card, and it dominated
 * the page — which meant progress, blockers and what shipped were all below
 * something a reader had already learned to scroll past. It is now a compact
 * chip that expands on click.
 *
 * WHAT DID NOT CHANGE, and must not: it is still crimson, still on the hero
 * card, still names every failing item, and every status it shows still carries
 * the date of the reading behind it. Demoting a warning is a layout decision;
 * softening it would be a different and much worse one. It never renders
 * collapsed-and-silent — the counts and the audit date are on the chip face, so
 * the expansion adds detail rather than revealing the problem.
 *
 * The face used to end ", not re-run since". That came off when six items WERE
 * re-read, because it had become false — but the fact it protected has not been
 * dropped: the passing remainder states its own staleness in the expansion, and
 * every un-revisited item says so in its evidence line. The invariant is that a
 * reading is never shown without its date, not that any particular sentence
 * survives.
 *
 * IT ALSO SUBTRACTS THE DESCOPES, and that is the one arithmetic it is allowed
 * to do. The record's statuses stay as audited; items in `record.outOfScope`
 * leave the failure count here, on screen, with the drop stated on the chip face
 * and every descoped item named, dated and reasoned in the expansion. A panel
 * that counted a deliberate decision as a defect was wrong; one that quietly
 * dropped it would be worse.
 *
 * ── EVERY ITEM IS ACCOUNTED FOR, INCLUDING THE ONES THAT PASSED ─────────────
 * The record enumerates all fourteen, so this renders all fourteen: failing and
 * partial by name with their evidence, and the remainder counted with the date
 * of the reading attached. A reader who sees "4 failing" must not be able to
 * conclude the other ten were checked today, because ten of them were not.
 */
export function AlphaChip({
  items,
  today,
  record = ALPHA_GATE,
  deployedSha,
}: {
  items: readonly OpsRoadmapItem[]
  today: Date
  record?: AlphaGateRecord
  /**
   * `process.env.VERCEL_GIT_COMMIT_SHA`, read by the server component that
   * renders this and passed in — so the component stays pure and its tests
   * stay deterministic. Undefined locally, which is a real state, not a bug.
   */
  deployedSha?: string
}) {
  const alphaItems = items.filter((item) => item.stage === 'alpha')
  const titleOf = (code: string) => alphaItems.find((item) => item.code === code)

  // A descoped item is a decision, not a defect, so it leaves the failure count
  // — but the subtraction is done HERE, in the open, and never in the record.
  // `alpha-gate.ts` still transcribes what the audit found; this is the only
  // place the two numbers are reconciled, and the chip face states both.
  const descoped = new Set(record.outOfScope.map((entry) => entry.code))
  const counted = record.assessments.filter((a) => !descoped.has(a.code))

  const failing = counted.filter((a) => a.status === 'fail')
  const partial = counted.filter((a) => a.status === 'partial')
  const passing = counted.filter((a) => a.status === 'pass')

  // How many recorded defects the descope removed. Only fails and partials
  // count: descoping something that was already passing did not shrink this.
  const descopedDefects = record.assessments.filter(
    (a) => descoped.has(a.code) && a.status !== 'pass',
  ).length

  // Codes in the record that no longer exist on the roadmap. Silence here would
  // quietly shrink the count.
  const unmatched = counted.filter((a) => titleOf(a.code) === undefined).length

  // Same guard on the other list: a descoped code matching no roadmap item must
  // be visible, or a typo in the descope would silently erase a real failure.
  const unmatchedDescopes = record.outOfScope.filter((entry) => titleOf(entry.code) === undefined)

  const age = gateAgeDays(record, today)
  const stale = age > GATE_STALE_AFTER_DAYS
  const drift = shaDrift(record, deployedSha)

  // Partials are defects. A "ship" verdict with five half-built items is not a
  // pass, so this early return needs both to be empty — the old version tested
  // failures alone and would have gone green the moment a fail became a partial.
  if (record.verdict === 'ship' && failing.length === 0 && partial.length === 0) {
    return (
      <p className="text-[12px] text-ok">
        Alpha items all passed when last checked, {ageLabel(age)}.
        {/* A green line that omits what was never attempted is the same lie as a
            shrunken count, just in a friendlier colour. */}
        {record.outOfScope.length > 0
          ? ` ${record.outOfScope.length} item${record.outOfScope.length === 1 ? ' was' : 's were'} out of scope and not assessed.`
          : ''}
      </p>
    )
  }

  return (
    <details className="group rounded-input border border-danger/30 bg-danger-bg">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-input px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <OctagonAlert size={14} strokeWidth={2.2} aria-hidden className="shrink-0 text-danger" />
        <span className="text-[12px] font-bold text-danger">
          Alpha gate:{' '}
          <span className="tabular-nums">
            {failing.length} of {alphaItems.length}
          </span>{' '}
          failing
          {partial.length > 0 ? (
            <>
              {' '}
              · <span className="tabular-nums">{partial.length}</span> partial
            </>
          ) : null}
          {descopedDefects > 0 ? (
            // On the FACE, not only in the expansion. A count that drops with
            // the reason hidden behind a click is the same silence the
            // `unmatched` line exists to prevent.
            <>
              {' '}
              · <span className="tabular-nums">{descopedDefects}</span> out of scope
            </>
          ) : null}
          , audited {formatShort(record.recordedOn)}
        </span>
        <span className="ml-auto shrink-0 text-[11px] font-medium text-danger/80 group-open:hidden">
          Show
        </span>
        <span className="ml-auto hidden shrink-0 text-[11px] font-medium text-danger/80 group-open:inline">
          Hide
        </span>
      </summary>

      <div className="border-t border-danger/20 px-3 pt-2.5 pb-3">
        <p className="text-[12px] font-semibold text-danger">
          Alpha is not shippable. These items were assessed as not working:
        </p>
        {failing.length === 0 ? (
          <p className="mt-1.5 text-[12px] text-ink">
            Nothing is recorded as fully broken. That is not a pass — see the partial items below.
          </p>
        ) : (
          <AssessmentList entries={failing} titleOf={titleOf} />
        )}

        {/* Partial is the status this panel most needs to state plainly. An item
            that does half of what was asked is neither a failure to be counted
            with the rest nor a pass to be left silent. */}
        {partial.length > 0 ? (
          <div className="mt-2.5 border-t border-danger/20 pt-2.5">
            <p className="text-[12px] font-semibold text-warn">
              Partly working — real, and not what was asked for:
            </p>
            <AssessmentList entries={partial} titleOf={titleOf} />
          </div>
        ) : null}

        {unmatched > 0 ? (
          <p className="mt-1.5 text-[11px] text-warn tabular-nums">
            {unmatched} assessed item{unmatched === 1 ? '' : 's'} no longer match a roadmap item —
            the record and the roadmap disagree.
          </p>
        ) : null}

        {/* Named, dated and reasoned — never merely subtracted. A reader who sees
            the count drop must be able to find out who dropped it and why
            without leaving the card. */}
        {record.outOfScope.length > 0 ? (
          <div className="mt-2.5 border-t border-danger/20 pt-2.5">
            <p className="text-[12px] font-semibold text-ink">
              Taken out of scope on purpose — not assessed as broken:
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {record.outOfScope.map((entry) => (
                <li key={entry.code} className="text-[12px] text-muted">
                  <span className="font-mono text-[10px] tabular-nums">{entry.code}</span>{' '}
                  <span className="text-ink">{titleOf(entry.code)?.title ?? 'unknown item'}</span>
                  <span className="block text-[11px]">
                    {entry.reason} Decided {entry.decidedOn}.
                  </span>
                </li>
              ))}
            </ul>
            {unmatchedDescopes.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-warn tabular-nums">
                {unmatchedDescopes.length === 1
                  ? '1 out-of-scope code matches no roadmap item'
                  : `${unmatchedDescopes.length} out-of-scope codes match no roadmap item`}{' '}
                — check it before trusting the count above.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* The remainder, counted and dated. Leaving these unmentioned is what
            let a reader treat "not listed" as "verified fine". */}
        {passing.length > 0 ? (
          <p className="mt-2.5 border-t border-danger/20 pt-2.5 text-[12px] text-ink">
            The other <span className="font-semibold tabular-nums">{passing.length}</span> items
            were recorded passing by the {formatShort(record.recordedOn)} sweep and{' '}
            <span className="font-semibold">have not been re-checked since</span> — that is a
            reading from {ageLabel(age)}, not a statement about today.
          </p>
        ) : null}

        {/* Counting failures invites the reader to assume the rest passed. The
            eleven behavioural checks are a DIFFERENT list. Ten are unrun; the
            eleventh is now known to be unmeetable, and saying "never been run"
            of that one would contradict A9's own evidence two inches above. */}
        <p className="mt-2 text-[12px] text-ink">
          Separately, the <span className="font-semibold tabular-nums">11 behavioural checks</span>{' '}
          of the Alpha Gate are a different list.{' '}
          <span className="font-semibold tabular-nums">10</span> are{' '}
          <span className="font-semibold">unverified, not failed</span> — nobody has run them. The
          eleventh, “a scheduled post fires within ±60s”, cannot be met as built: the cron that
          publishes ticks every five minutes (A9).
        </p>

        {/* Stated as fact, in muted type, deliberately NOT an alarm. Work lands
            here several times a day, so a red banner on every deploy would be
            lit permanently and learned-past within a week — the exact failure
            this component's demotion exists to avoid. */}
        <p className="mt-2 text-[11px] text-muted">
          {drift === 'unknown' ? (
            <>
              Audited at <span className="font-mono">{record.auditedSha}</span>. This build recorded
              no deployed commit, so the audit cannot be matched to what is running.
            </>
          ) : drift === 'match' ? (
            <>
              Audited at <span className="font-mono">{record.auditedSha}</span>, which is the commit
              deployed.
            </>
          ) : (
            <>
              Audited at <span className="font-mono">{record.auditedSha}</span>; deployed is{' '}
              <span className="font-mono">{shortSha(deployedSha ?? '')}</span>. Work has landed
              since the audit, so it does not describe this build exactly.
            </>
          )}
        </p>

        <p className="mt-2 text-[11px] text-muted">
          Recorded {ageLabel(age)} · {record.source}.
          {stale ? ' This verdict may be out of date.' : ''}
        </p>
      </div>
    </details>
  )
}

/** Code, title and the sentence of evidence behind the status. */
function AssessmentList({
  entries,
  titleOf,
}: {
  entries: readonly AlphaAssessment[]
  titleOf: (code: string) => OpsRoadmapItem | undefined
}) {
  return (
    <ul className="mt-1.5 space-y-1.5">
      {entries.map((entry) => (
        <li key={entry.code} className="text-[12px] text-ink">
          <span className="font-mono text-[10px] text-muted tabular-nums">{entry.code}</span>{' '}
          {titleOf(entry.code)?.title ?? 'unknown item'}
          <span className="block text-[11px] text-muted">
            {entry.evidence}
            {entry.revisedOn ? ` Re-read ${entry.revisedOn}.` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** `2026-07-25` → `25 Jul`. Short because it sits inside a one-line chip. */
function formatShort(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(at)) return iso
  return new Date(at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
