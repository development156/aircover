import { describe, expect, it } from 'vitest'
import { describeFailure, targetRefusal, tenantRef } from '../smoke-db-probe.mjs'

const STAGING = 'yoxmzwkxweasfaahhvpj'
const PROD = 'rloztdhzfliyvpvxsgjl'
const pooler = (ref, password = 'pw') =>
  `postgresql://postgres.${ref}:${password}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`

describe('smoke-db-probe', () => {
  it('reads the project ref out of the pooler user', () => {
    expect(tenantRef(pooler(STAGING))).toBe(STAGING)
    expect(tenantRef(`postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`)).toBe(PROD)
    expect(tenantRef('postgresql://postgres:pw@db.example.supabase.co:5432/postgres')).toBeNull()
    expect(tenantRef('not a url')).toBeNull()
  })

  it('refuses a production pooler string beside a staging acknowledgement', () => {
    const refusal = targetRefusal(tenantRef(pooler(PROD)), STAGING)
    expect(refusal).toMatch(/REFUSED/)
    expect(refusal).toContain(PROD)
    expect(refusal).toContain(STAGING)
  })

  it('accepts the acknowledged project, and anything when nothing was acknowledged', () => {
    expect(targetRefusal(STAGING, STAGING)).toBeNull()
    expect(targetRefusal(PROD, '')).toBeNull()
    expect(targetRefusal(PROD, undefined)).toBeNull()
  })

  it('names the password, and the one place that resets it', () => {
    const sentence = describeFailure(
      new Error('password authentication failed for user "postgres"'),
    )
    expect(sentence).toMatch(/wrong password/)
    expect(sentence).toMatch(/Reset database password/)
    expect(sentence).toMatch(/E2E_SUPABASE_DB_URL/)
    // Never the URL itself: a refusal that echoes the secret is a leak.
    expect(sentence).not.toMatch(/postgres(ql)?:\/\//)
  })

  it('tells a wrong tenant from a wrong password from an unreachable host', () => {
    expect(describeFailure(new Error('Tenant or user not found'))).toMatch(
      /does not know this project/,
    )
    expect(describeFailure(new Error('Connection terminated due to connection timeout'))).toMatch(
      /could not reach/,
    )
    expect(describeFailure('boom')).toMatch(/refused the connection: boom/)
  })
})
