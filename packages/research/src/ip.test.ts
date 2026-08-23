import { describe, it, expect } from 'vitest'

import { isPrivateAddress, isPrivateIpv4, isPrivateIpv6, parseIpv6 } from './ip'

/**
 * ── THE TEST-SHAPE TRAP THIS FILE IS BUILT AROUND ────────────────────────────
 * The guard this replaces had a case for `::ffff:169.254.169.254` and a passing
 * test for it. Both were fiction: `new URL` never hands that string to anything.
 * So the cases below are generated from what the runtime ACTUALLY produces —
 * `new URL(...).hostname` for a typed literal, and the address family `dns.lookup`
 * reports — and a test asserting on a human-typed form is only ever a second
 * assertion beside the machine one, never the only one.
 */

/** Every spelling of the AWS/GCP metadata endpoint an attacker can reach for. */
const METADATA_FORMS = [
  ['dotted quad', '169.254.169.254'],
  ['IPv4-mapped, hextets — what new URL produces', '::ffff:a9fe:a9fe'],
  ['IPv4-mapped, dotted — what a human types', '::ffff:169.254.169.254'],
  ['IPv4-mapped, uncompressed', '0:0:0:0:0:ffff:a9fe:a9fe'],
  ['IPv4-compatible (deprecated)', '::a9fe:a9fe'],
  ['IPv4-translated', '::ffff:0:a9fe:a9fe'],
  ['6to4', '2002:a9fe:a9fe::'],
  ['6to4, deeper in the prefix', '2002:a9fe:a9fe:1::5'],
  ['NAT64 well-known prefix', '64:ff9b::a9fe:a9fe'],
  ['NAT64, dotted tail', '64:ff9b::169.254.169.254'],
  ['NAT64 local-use prefix', '64:ff9b:1::a9fe:a9fe'],
] as const

describe('the metadata endpoint, in every form it can be spelled', () => {
  for (const [name, form] of METADATA_FORMS) {
    it(`refuses ${name}: ${form}`, () => {
      expect(isPrivateAddress(form)).toBe(true)
    })
  }

  it('is still refused after new URL has rewritten it', () => {
    // THE MEASUREMENT THAT KILLED THE OLD GUARD. Each typed form below is
    // normalised by WHATWG before any guard sees it; the dotted-quad regex the
    // old code matched on could therefore never fire.
    const typed = [
      'http://[::ffff:169.254.169.254]/',
      'http://[0:0:0:0:0:ffff:a9fe:a9fe]/',
      'http://2852039166/', // decimal
      'http://0xA9FEA9FE/', // hex
      'http://0251.0376.0251.0376/', // octal
      'http://169.254.169.254./', // trailing dot
    ]
    for (const raw of typed) {
      const host = new URL(raw).hostname.replace(/^\[|\]$/g, '')
      expect({ raw, host, refused: isPrivateAddress(host) }).toEqual({
        raw,
        host,
        refused: true,
      })
    }
  })
})

describe('IPv4', () => {
  it('allows real public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '142.250.190.78', '223.255.255.255']) {
      expect(isPrivateIpv4(ip)).toBe(false)
    }
  })

  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.0',
    '255.255.255.255',
  ])('refuses %s', (ip) => {
    expect(isPrivateIpv4(ip)).toBe(true)
  })

  it('does not over-block the edges of a private range', () => {
    // Carried from the address-guard test this file absorbs.
    expect(isPrivateIpv4('172.15.255.255')).toBe(false)
    expect(isPrivateIpv4('172.32.0.1')).toBe(false)
    expect(isPrivateIpv4('100.63.255.255')).toBe(false)
    expect(isPrivateIpv4('100.128.0.1')).toBe(false)
  })

  it('refuses what it cannot parse, rather than assuming it is public', () => {
    for (const junk of ['', 'not-an-ip', '999.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4x']) {
      expect(isPrivateIpv4(junk)).toBe(true)
    }
  })
})

describe('IPv6', () => {
  it('allows real public addresses', () => {
    for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '2400:cb00::1']) {
      expect(isPrivateIpv6(ip)).toBe(false)
    }
  })

  it.each([
    ['unspecified', '::'],
    ['loopback', '::1'],
    ['unique-local', 'fc00::1'],
    ['unique-local, fd', 'fd12:3456::1'],
    ['link-local', 'fe80::1'],
    ['link-local with a zone id', 'fe80::1%eth0'],
    ['site-local (deprecated)', 'fec0::1'],
    ['multicast', 'ff02::1'],
    ['discard-only', '100::1'],
    ['Teredo tunnel', '2001:0:4136:e378:8000:63bf:3fff:fdd2'],
    ['documentation', '2001:db8::1'],
    ['documentation (RFC 9637)', '3fff::1'],
    ['benchmarking', '2001:2::1'],
    ['mapped loopback', '::ffff:7f00:1'],
    ['mapped private', '::ffff:c0a8:1'],
  ])('refuses %s: %s', (_name, ip) => {
    expect(isPrivateIpv6(ip)).toBe(true)
  })

  it('refuses what it cannot parse — the hole the prefix regexes left open', () => {
    // The predecessor fell past three `^` tests and returned false here, so a
    // MALFORMED address was safer to send a request at than a well-formed one.
    for (const junk of [
      '',
      'zzzz::1',
      '1:2:3:4:5:6:7:8:9',
      '::ffff:999.1.1.1',
      ':::1',
      '12345::1',
    ]) {
      expect(isPrivateIpv6(junk)).toBe(true)
    }
  })

  it('allows a public IPv4 carried inside a v6 form', () => {
    // The classifier must not simply refuse every embedded form — a real site
    // behind NAT64 or 6to4 is reachable and legitimate.
    expect(isPrivateIpv6('::ffff:808:808')).toBe(false) // ::ffff:8.8.8.8
    expect(isPrivateIpv6('2002:808:808::')).toBe(false) // 6to4 of 8.8.8.8
    expect(isPrivateIpv6('64:ff9b::808:808')).toBe(false) // NAT64 of 8.8.8.8
  })

  it('parses compression, hextets and a dotted tail to the same eight numbers', () => {
    expect(parseIpv6('::ffff:169.254.169.254')).toEqual(parseIpv6('::ffff:a9fe:a9fe'))
    expect(parseIpv6('0:0:0:0:0:ffff:a9fe:a9fe')).toEqual(parseIpv6('::ffff:a9fe:a9fe'))
    expect(parseIpv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    // `::` must stand for at least one zero group — a compression of nothing is
    // not an address, and accepting it would let a nine-group string parse.
    expect(parseIpv6('1:2:3:4:5:6:7::8')).toBeNull()
  })
})

describe('family is honoured when dns.lookup reports one', () => {
  it('judges by the stated family, not by the shape', () => {
    expect(isPrivateAddress('127.0.0.1', 4)).toBe(true)
    expect(isPrivateAddress('8.8.8.8', 4)).toBe(false)
    expect(isPrivateAddress('::1', 6)).toBe(true)
    expect(isPrivateAddress('::ffff:a9fe:a9fe', 6)).toBe(true)
  })
})
