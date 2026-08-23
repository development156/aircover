import { describe, it, expect } from 'vitest'

import { normalizeUrl } from './locator'

/**
 * Every case here is written as the STRING A PERSON TYPES, because that is the
 * only form this function is ever handed. The guard behind it works on the
 * normalised address `new URL` produces, and the two are not the same text — a
 * test that asserted on the normalised form would be testing the classifier
 * twice and this door not at all.
 */
describe('the watch-list door', () => {
  it.each([
    ['the metadata endpoint', 'http://169.254.169.254/latest/meta-data/'],
    ['the metadata endpoint in decimal', 'http://2852039166/'],
    ['the metadata endpoint in hex', 'http://0xA9FEA9FE/'],
    ['the metadata endpoint in octal', 'http://0251.0376.0251.0376/'],
    ['the metadata endpoint with a trailing dot', 'http://169.254.169.254./'],
    ['loopback', 'http://127.0.0.1:5432/'],
    ['loopback, short form', 'http://127.1/'],
    ['RFC1918', 'http://10.0.0.1/admin'],
    ['RFC1918, one-nine-two', 'https://192.168.0.1/'],
    ['IPv6 loopback', 'http://[::1]:6379/'],
    ['IPv4-mapped IPv6', 'http://[::ffff:169.254.169.254]/'],
    ['IPv4-mapped IPv6 in hextets', 'http://[::ffff:a9fe:a9fe]/'],
    ['6to4', 'http://[2002:a9fe:a9fe::]/'],
    ['NAT64', 'http://[64:ff9b::a9fe:a9fe]/'],
    ['link-local IPv6', 'http://[fe80::1]/'],
    ['unique-local IPv6', 'http://[fd00::1]/'],
    ['credentials aimed at a private host', 'http://root:root@10.0.0.1/'],
    ['credentials aimed anywhere', 'https://user:pass@example.com/'],
    ['a file read', 'file:///etc/passwd'],
    ['a script scheme', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,<h1>hi</h1>'],
    ['a gopher probe', 'gopher://127.0.0.1:6379/_INFO'],
    ['not a URL at all', 'their site'],
    ['empty', ''],
  ])('refuses %s: %s', (_name, raw) => {
    expect(normalizeUrl(raw)).toBeNull()
  })

  it.each([
    'https://example.com/',
    'http://example.com/pricing',
    'https://sub.example.co.in/a/b?c=d',
    'https://8.8.8.8/',
  ])('accepts a real address: %s', (raw) => {
    expect(normalizeUrl(raw)).not.toBeNull()
  })

  it('returns the normalised form, so what is stored is what was checked', () => {
    expect(normalizeUrl('  https://Example.com  ')).toBe('https://example.com/')
  })
})
