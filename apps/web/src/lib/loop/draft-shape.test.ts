import { describe, expect, it } from 'vitest'
import { DISPATCHABLE_STATUSES } from '@sahoda/shared'

import { APPROVABLE_FROM } from '@/lib/planner/transitions'
import { rungFor } from '@/lib/posts/rung'

import { draftShapeFor } from './draft-shape'

const SLOT = '2026-01-27T04:30:00.000Z'

describe('what the create stage writes, per rung of the dial', () => {
  it('L2 waits for a person: on the approvals queue, approvable, and NOT in the sweep', () => {
    const shape = draftShapeFor(2, SLOT)
    // The claim the customer was sold: "publishes each post once you approve it".
    // Asserted against the real lists, so a status that quietly re-enters the
    // dispatcher's gate turns this red rather than passing on a string.
    expect(DISPATCHABLE_STATUSES as readonly string[]).not.toContain(shape.status)
    expect(APPROVABLE_FROM as readonly string[]).toContain(shape.status)
    expect(rungFor(shape.status)).toBe('urgent')
    // The slot rides along, so the approval schedules it rather than asking again.
    expect(shape.scheduledAt).toBe(SLOT)
    expect(shape.outcome).toBe('awaiting_approval')
  })

  it('L3 leaves a draft with no time on it, so only the autopilot dispatcher can schedule it', () => {
    const shape = draftShapeFor(3, SLOT)
    expect(shape.status).toBe('draft')
    expect(shape.scheduledAt).toBeNull()
    expect(DISPATCHABLE_STATUSES as readonly string[]).not.toContain(shape.status)
  })

  it('L1 leaves a draft in the Planner with no schedule', () => {
    expect(draftShapeFor(1, SLOT)).toEqual({
      status: 'draft',
      scheduledAt: null,
      outcome: 'drafted',
    })
  })
})
