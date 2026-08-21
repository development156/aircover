import { describe, expect, it } from 'vitest'
import { evaluateFreeWorkspace, FREE_WORKSPACES_PER_USER } from './freeTier'

const input = (over: Partial<Parameters<typeof evaluateFreeWorkspace>[0]> = {}) => ({
  existingFreeWorkspaces: 0,
  hasPaidWorkspace: false,
  ...over,
})

describe('evaluateFreeWorkspace', () => {
  it('allows a first free workspace', () => {
    expect(evaluateFreeWorkspace(input())).toEqual({ allowed: true, rule: null, message: null })
  })

  it('refuses a second one, and names the rule', () => {
    const d = evaluateFreeWorkspace(input({ existingFreeWorkspaces: FREE_WORKSPACES_PER_USER }))
    expect(d.allowed).toBe(false)
    expect(d.rule).toBe('free_workspace_cap')
  })

  it('does not apply to a paying customer at all', () => {
    // The cap stops the free plan being multiplied. It is not a limit on somebody who pays.
    const d = evaluateFreeWorkspace(input({ existingFreeWorkspaces: 5, hasPaidWorkspace: true }))
    expect(d.allowed).toBe(true)
  })

  it('refuses a disposable email domain when a list is supplied', () => {
    const d = evaluateFreeWorkspace(
      input({
        emailDomain: 'MailInAtor.com',
        disposableDomains: new Set(['mailinator.com']),
      }),
    )
    expect(d.allowed).toBe(false)
    expect(d.rule).toBe('disposable_email')
  })

  it('does nothing about email when no list is supplied — an absent control, not a silent one', () => {
    // A short hard-coded list would read as a solved problem. With no list this check is
    // inert BY DESIGN, and that has to stay visible in the behaviour.
    const d = evaluateFreeWorkspace(input({ emailDomain: 'mailinator.com' }))
    expect(d.allowed).toBe(true)
  })

  it('refuses a disposable domain even for a paying customer', () => {
    // Order matters: the email check runs BEFORE the paid escape hatch, because a
    // throwaway address on a paid account is still an address we cannot reach.
    const d = evaluateFreeWorkspace(
      input({
        hasPaidWorkspace: true,
        emailDomain: 'mailinator.com',
        disposableDomains: new Set(['mailinator.com']),
      }),
    )
    expect(d.allowed).toBe(false)
  })

  it('throws rather than accept an uncounted zero', () => {
    // A caller that could not count must not be able to pass 0 and silently disable the
    // control — which is exactly what a `?? 0` at a call site would do.
    expect(() => evaluateFreeWorkspace(input({ existingFreeWorkspaces: Number.NaN }))).toThrow(
      /counted non-negative integer/,
    )
    expect(() => evaluateFreeWorkspace(input({ existingFreeWorkspaces: -1 }))).toThrow()
    expect(() => evaluateFreeWorkspace(input({ existingFreeWorkspaces: 1.5 }))).toThrow()
  })
})

describe('the refusal copy', () => {
  /**
   * READ THE TEXT, NOT THE SHAPE. `allowed: false` with an unreadable sentence is a
   * refusal the customer cannot act on, which is indistinguishable from a broken app.
   */
  it('names the count, names the way out, and never mentions risk or suspicion', () => {
    const d = evaluateFreeWorkspace(input({ existingFreeWorkspaces: 1 }))
    expect(d.message).toBeTruthy()
    const message = d.message as string
    expect(message).toContain('one workspace')
    expect(message).toContain('you already have 1')
    expect(message).toMatch(/paid plan/)
    for (const forbidden of [/risk/i, /suspicious/i, /score/i, /flagged/i, /abuse/i, /fraud/i]) {
      expect(message).not.toMatch(forbidden)
    }
    expect(message).not.toMatch(/undefined|NaN|\[object/)
  })

  it('says nothing at all when it allows — there is no reassurance to render', () => {
    const d = evaluateFreeWorkspace(input())
    expect(d.message).toBeNull()
    expect(d.rule).toBeNull()
  })
})
