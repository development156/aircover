import type { ReportView } from '@/lib/report/model'
import { REPORT } from '@/lib/report/strings'

import { SectionBoundary } from './section-boundary'
import {
  ChangedBlock,
  CreditsLine,
  OneThingBlock,
  PlanBlock,
  ThreeNumbers,
  VerdictBlock,
  WorkedBlock,
} from './sections'

/**
 * THE WHOLE REPORT, IN THE ORDER A PERSON READS IT.
 *
 * One definition, two uses: the real week, and the greyed sample on the empty
 * state. A preview drawn by its own components is a preview free to promise a
 * page that does not exist.
 *
 * The order is the argument: was it good, by how much, which post did it, what I
 * did about it, what happens next, what you should do. Cost is a footnote and is
 * deliberately the lightest thing here — the page ends on value.
 */
export function ReportBody({
  report,
  noticed,
}: {
  report: ReportView
  /** The Marketing Brain's block. Absent on the greyed sample, which has none. */
  noticed?: React.ReactNode
}) {
  const holdingBack =
    report.verdict.kind === 'none' ||
    report.worked === null ||
    report.changed.length === 0 ||
    Object.values(report.numbers).some((n) => n.status !== 'ok')

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-6">
      <SectionBoundary>
        <VerdictBlock verdict={report.verdict} week={report.week} />
      </SectionBoundary>

      <SectionBoundary>
        <ThreeNumbers numbers={report.numbers} />
      </SectionBoundary>

      <SectionBoundary>
        <WorkedBlock worked={report.worked} />
      </SectionBoundary>

      {noticed ? <SectionBoundary>{noticed}</SectionBoundary> : null}

      <SectionBoundary>
        <ChangedBlock changed={report.changed} />
      </SectionBoundary>

      <SectionBoundary>
        <PlanBlock plan={report.plan} />
      </SectionBoundary>

      <SectionBoundary>
        <OneThingBlock oneThing={report.oneThing} />
      </SectionBoundary>

      {/* The promise the reader is owed whenever a block is withholding
          something. It is a trust feature, so it is stated plainly and never
          apologised for. It disappears on a week where nothing was held back,
          because a page that always says it stops being read. */}
      {holdingBack ? <p className="type-sm text-muted">{REPORT.principle}</p> : null}

      <SectionBoundary>
        <CreditsLine credits={report.credits} />
      </SectionBoundary>
    </div>
  )
}
