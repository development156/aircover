import { describe, expect, test } from 'vitest'

import { CAN_DO, describeInstruction, parseInstruction } from './instruct'

describe('parseInstruction', () => {
  test('a request to write becomes a draft with the rest of the sentence as its name', () => {
    expect(parseInstruction('write a post about the monsoon menu')).toEqual({
      kind: 'write',
      title: 'the monsoon menu',
    })
    expect(parseInstruction('Draft something for Diwali offers.')).toEqual({
      kind: 'write',
      title: 'something for Diwali offers',
    })
    expect(parseInstruction('write a post')).toEqual({ kind: 'write', title: '' })
  })

  test('a request to see something opens the screen that owns it', () => {
    expect(parseInstruction('plan my week')).toMatchObject({ kind: 'open', href: '/planner' })
    expect(parseInstruction('connect instagram')).toMatchObject({
      kind: 'open',
      href: '/connections',
    })
    expect(parseInstruction('what needs my ok')).toMatchObject({ kind: 'open', href: '/approvals' })
    expect(parseInstruction('buy more credits')).toMatchObject({ kind: 'open', href: '/wallet' })
    expect(parseInstruction('teach you about my business')).toMatchObject({
      kind: 'open',
      href: '/brain',
    })
    expect(parseInstruction('how are my posts doing')).toMatchObject({
      kind: 'open',
      href: '/analytics',
    })
  })

  test('anything else is refused plainly, with the three things it can do', () => {
    const unknown = parseInstruction('make me famous by friday')
    expect(unknown).toEqual({ kind: 'unknown' })
    const words = describeInstruction(unknown)
    expect(words).toMatch(/cannot do that from here yet/i)
    for (const can of CAN_DO) expect(words).toContain(can)
  })

  test('an empty box is not an instruction', () => {
    expect(parseInstruction('   ')).toEqual({ kind: 'unknown' })
  })

  test('"plan my week" opens the planner and does not spend', () => {
    // The Loop costs credits and has its own cost preview; the console takes
    // the reader there rather than pressing the paid button for them.
    expect(describeInstruction(parseInstruction('plan my week'))).toBe('Opening your week.')
  })

  test('every sentence the box says is plain', () => {
    for (const text of ['write a post about chai', 'open my week', 'connect an account', 'xyz']) {
      expect(describeInstruction(parseInstruction(text))).not.toMatch(
        /\b(variant|ledger|status|cron|action|mutation)\b/i,
      )
    }
  })
})
