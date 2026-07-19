import { describe, expect, it } from 'vitest'
import { pgSsl } from './pgSsl'

/**
 * pgSsl decides whether to skip TLS chain verification. It may only ever do so for a genuine
 * Supabase host, because Supabase's direct endpoint presents a private CA chain. Anywhere else,
 * relaxing verification is a MITM invitation.
 */
const relaxes = (dsn: string): boolean => {
  const ssl = pgSsl(dsn)
  return typeof ssl === 'object' && ssl !== null && 'rejectUnauthorized' in ssl
    ? ssl.rejectUnauthorized === false
    : false
}

describe('pgSsl — relaxed verification is Supabase-only', () => {
  it('relaxes for a genuine Supabase host', () => {
    expect(relaxes('postgres://u:p@db.abc.supabase.co:5432/postgres')).toBe(true)
  })

  it.each([
    ['a plain third-party host', 'postgres://u:p@evil.com:5432/postgres'],
    ['a look-alike suffix', 'postgres://u:p@evil-supabase.com:5432/postgres'],
    ['supabase in the path only', 'postgres://u:p@evil.com:5432/supabase.co'],
    ['supabase in the user', 'postgres://supabase.co:p@evil.com:5432/postgres'],
    ['a subdomain-shaped fake', 'postgres://u:p@supabase.co.evil.com:5432/postgres'],
  ])('does NOT relax for %s', (_l, dsn) => {
    expect(relaxes(dsn)).toBe(false)
  })

  /**
   * A libpq DSN may carry ?host=, which pg-connection-string gives PRECEDENCE over the
   * authority host. Verified against the real parser: with this DSN, new URL().hostname says
   * db.abc.supabase.co while pg connects to evil.com. Reading only the authority host would
   * disable certificate verification on a connection to an attacker-controlled server.
   */
  it('does NOT relax when a ?host= override points away from Supabase', () => {
    expect(relaxes('postgres://u:p@db.abc.supabase.co:5432/postgres?host=evil.com')).toBe(false)
  })

  it('honours a ?host= override that points AT Supabase', () => {
    expect(relaxes('postgres://u:p@10.0.0.5:5432/postgres?host=db.abc.supabase.co')).toBe(true)
  })

  it('ignores an empty ?host= and falls back to the authority host', () => {
    expect(relaxes('postgres://u:p@db.abc.supabase.co:5432/postgres?host=')).toBe(true)
  })

  it('does not relax for an unparseable connection string', () => {
    expect(relaxes('not a dsn at all')).toBe(false)
  })

  it.each(['supabase.co', 'supabase.com', 'supabase.in', 'supabase.net'])(
    'accepts the %s TLD',
    (tld) => {
      expect(relaxes(`postgres://u:p@db.abc.${tld}:5432/postgres`)).toBe(true)
    },
  )
})
