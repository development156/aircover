import { describe, expect, test } from 'vitest'

import { planPostSentence } from './plan-status'

describe('planPostSentence', () => {
  test('an expired post is never described as waiting for approval (IL-02)', () => {
    expect(planPostSentence('expired', 'awaiting_approval')).toBe('Expired before it was approved')
    expect(planPostSentence('expired', 'awaiting_approval')).not.toMatch(/approval$/i)
  })

  test('a live status wins over the stage outcome', () => {
    expect(planPostSentence('published', 'awaiting_approval')).toBe('Published')
    expect(planPostSentence('scheduled', 'drafted')).toBe('Booked in your Planner')
  })

  test('with no readable status the sentence is the past fact, not a present claim', () => {
    expect(planPostSentence(null, 'awaiting_approval')).toBe(
      'Sent to Approvals when the plan was written',
    )
  })
})
