import { SAMPLE_REPORT } from '@/lib/report/sample-report'
import { REPORT } from '@/lib/report/strings'

import { ReportBody } from './report-body'

export function SamplePreview() {
  return (
    <div>
      <p className="type-meta text-muted">{REPORT.empty.sampleLabel}</p>
      <div
        aria-hidden
        inert
        className="mt-3 opacity-40 select-none [&_a]:pointer-events-none [&_button]:pointer-events-none"
      >
        <ReportBody report={SAMPLE_REPORT} />
      </div>
    </div>
  )
}
