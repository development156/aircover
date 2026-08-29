import type { Channel } from '@sahoda/shared'

import type { Verdict } from './verdict'

/**
 * THE REPORT, AS A VALUE.
 *
 * Every section is its own field and every one of them can be `null` or carry an
 * `unreadable` status independently. That is the shape the "one missing source
 * must not blank the page" rule demands: a failed inbox read costs the replies
 * number and nothing else.
 */

/** A figure with the comparison it is allowed to make, and never one it is not. */
export type Compared =
  | { status: 'ok'; value: number; comparison: string }
  | { status: 'learning'; value: number }
  | { status: 'unreadable' }

export interface WorkedPost {
  postId: string
  title: string
  channel: Channel
  /** The channel as a person writes it. `gbp` reached the page as `gbp`. */
  channelName: string
  value: number
  /** What was counted. Never a jargon word: this reaches the reader. */
  measure: string
}

export interface PlanRow {
  id: string
  title: string
  channels: readonly string[]
  /** Day and time in the owner's own zone, already formatted, or null. */
  when: string | null
  status: 'awaiting_approval' | 'scheduled' | 'drafted'
}

export interface OneThing {
  body: string
  action: string
  href: string
}

export interface ReportView {
  week: { label: string; postsRan: number | null; channels: readonly string[] }
  verdict: Verdict
  numbers: { reach: Compared; replies: Compared; enquiries: Compared }
  worked: { best: WorkedPost; weakest: WorkedPost } | null
  changed: readonly string[]
  plan: readonly PlanRow[]
  oneThing: OneThing | null
  credits: { spent: number; budget: number | null }
}
