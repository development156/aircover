'use client'

import * as React from 'react'

import { REPORT } from '@/lib/report/strings'

/**
 * ONE SECTION FALLING OVER MUST NOT TAKE THE PAGE WITH IT.
 *
 * The report is six independent claims about somebody's week. If the plan cannot
 * render, the verdict and the three numbers are still true and still worth the
 * reader's minute, so the failure is contained to the block that had it and
 * says so in one honest line.
 *
 * It offers NO remedy. A reload cannot fix a section that threw on data it was
 * handed, and offering one would be the impossible remedy this codebase already
 * forbids elsewhere.
 */
export class SectionBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (this.state.failed) {
      return (
        <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
          {REPORT.failure.section}
        </p>
      )
    }
    return this.props.children
  }
}
