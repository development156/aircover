import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  DEPLOYMENT_CONFIG_MESSAGE,
  isDeploymentConfigCause,
  reportPaidActionFailure,
} from './paid-failure'

const MESH_ENV_ERROR =
  '@sahoda/mesh: missing required env var(s): OPENROUTER_API_KEY_RESEARCH, OPENAI_API_KEY'
const BILLING_ENV_ERROR = '@sahoda/billing: missing required env — SUPABASE_DB_URL'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isDeploymentConfigCause — classification', () => {
  test('recognises the mesh env loader error thrown as an Error', () => {
    expect(isDeploymentConfigCause(new Error(MESH_ENV_ERROR))).toBe(true)
  })

  test('recognises the billing env loader error thrown as an Error', () => {
    expect(isDeploymentConfigCause(new Error(BILLING_ENV_ERROR))).toBe(true)
  })

  test('recognises an AppError-shaped object carrying the mesh env message', () => {
    // withCredits wraps a callback throw into { code, message, … } — the mesh
    // config error reaches the action in that shape, not as an Error instance.
    expect(isDeploymentConfigCause({ code: 'PROVIDER_ERROR', message: MESH_ENV_ERROR })).toBe(true)
  })

  test('does not classify an ordinary infrastructure error as config', () => {
    expect(isDeploymentConfigCause(new Error('connect ENETUNREACH 2406:da1a::1:5432'))).toBe(false)
  })

  test('does not classify provider text that merely mentions an env var name', () => {
    expect(isDeploymentConfigCause(new Error('model said: set SUPABASE_DB_URL to win'))).toBe(false)
  })

  test('handles non-Error causes without throwing', () => {
    expect(isDeploymentConfigCause(undefined)).toBe(false)
    expect(isDeploymentConfigCause(null)).toBe(false)
    expect(isDeploymentConfigCause(42)).toBe(false)
    expect(isDeploymentConfigCause({ code: 'PROVIDER_ERROR' })).toBe(false)
    expect(isDeploymentConfigCause(MESH_ENV_ERROR)).toBe(true)
  })
})

describe('DEPLOYMENT_CONFIG_MESSAGE', () => {
  test('claims not-charged and does not invite a retry', () => {
    expect(DEPLOYMENT_CONFIG_MESSAGE).toContain('not charged')
    expect(DEPLOYMENT_CONFIG_MESSAGE.toLowerCase()).not.toContain('try again')
  })
})

describe('reportPaidActionFailure — server-side logging', () => {
  test('logs the scope, code and message of an AppError-shaped failure', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    reportPaidActionFailure('plan-week', { code: 'PROVIDER_ERROR', message: BILLING_ENV_ERROR })

    expect(spy).toHaveBeenCalledTimes(1)
    const line = String(spy.mock.calls[0]?.[0])
    expect(line).toContain('[plan-week]')
    expect(line).toContain('PROVIDER_ERROR')
    expect(line).toContain(BILLING_ENV_ERROR)
  })

  test('logs a plain Error message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    reportPaidActionFailure('brand-resolve', new Error(MESH_ENV_ERROR))

    const line = String(spy.mock.calls[0]?.[0])
    expect(line).toContain('[brand-resolve]')
    expect(line).toContain(MESH_ENV_ERROR)
  })

  test('stays silent on an insufficient balance — a user condition, not an operator fault', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    reportPaidActionFailure('plan-week', {
      code: 'CREDIT_INSUFFICIENT',
      details: { required: 20, available: 3 },
    })

    expect(spy).not.toHaveBeenCalled()
  })

  test('never throws on hostile or empty causes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => reportPaidActionFailure('x', undefined)).not.toThrow()
    expect(() => reportPaidActionFailure('x', null)).not.toThrow()
    expect(() => reportPaidActionFailure('x', { message: 9 })).not.toThrow()
    expect(() => reportPaidActionFailure('x', Symbol('boom'))).not.toThrow()
  })
})
