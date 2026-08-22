import { describe, it, expect } from 'vitest'

import { isPrivateAddress } from './safe-fetch'

/**
 * IPv6 SPELLINGS OF ADDRESSES THAT ARE REALLY IPv4.
 *
 * ── WHY THIS SUITE EXISTS ────────────────────────────────────────────────────
 * `isPrivateIpv6` matched SPELLINGS. It had one regex, `^::ffff:(\d+\.\d+\.\d+\.\d+)$`,
 * so it judged the IPv4-mapped form only when the mapped address was written in
 * dotted quad. MEASURED 2026-08-23, before the fix:
 *
 *     BLOCKED  ::ffff:169.254.169.254
 *     ALLOWED  ::ffff:a9fe:a9fe            <- the SAME ADDRESS in hex
 *     ALLOWED  64:ff9b::a9fe:a9fe          <- NAT64, reaches v4 space
 *     ALLOWED  64:ff9b::169.254.169.254
 *
 * `a9fe:a9fe` is `169.254.169.254`. Both forms resolve to the same 128 bits and
 * both are what `dns.lookup` may hand back, so a guard that blocks one and
 * admits the other blocks nothing — the attacker picks the spelling.
 *
 * NAT64 is the same problem one prefix over: `64:ff9b::/96` exists precisely to
 * carry the whole IPv4 space, and it was the deleted onboarding guard — not this
 * one — that listed it. Removing that file made this file's job.
 *
 * The fix is to PARSE rather than match: expand to 128 bits, then ask what the
 * low 32 bits mean when the prefix says they are an IPv4 address.
 */
const blocked = (ip: string) => isPrivateAddress(ip, 6)

describe('an IPv4 address wearing an IPv6 spelling', () => {
  it.each([
    ['::ffff:169.254.169.254', 'IPv4-mapped, dotted quad — the form that already worked'],
    ['::ffff:a9fe:a9fe', 'IPv4-mapped, HEX — the same 128 bits, and it walked through'],
    ['::FFFF:A9FE:A9FE', 'the same again in upper case'],
    ['::ffff:127.0.0.1', 'loopback, mapped'],
    ['::ffff:7f00:1', 'loopback, mapped, hex'],
    ['::ffff:10.0.0.1', 'RFC1918, mapped'],
    ['::ffff:a00:1', 'RFC1918, mapped, hex'],
    ['64:ff9b::a9fe:a9fe', 'NAT64 — a prefix whose whole purpose is to reach v4'],
    ['64:ff9b::169.254.169.254', 'NAT64 written with a dotted tail'],
    ['64:ff9b::7f00:1', 'NAT64 to loopback'],
    ['2002:a9fe:a9fe::1', '6to4 — the v4 address is in the second and third hextets'],
    ['::169.254.169.254', 'the deprecated IPv4-compatible form'],
  ])('refuses %s (%s)', (ip) => {
    expect(blocked(ip)).toBe(true)
  })

  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fe80::1', 'link-local'],
    ['fc00::1', 'unique-local'],
    ['ff02::1', 'multicast'],
    ['2001:db8::1', 'documentation — not routable, so never a real customer site'],
  ])('still refuses %s (%s)', (ip) => {
    expect(blocked(ip)).toBe(true)
  })

  it.each([
    ['2606:4700:4700::1111', 'a real public resolver'],
    ['2400:cb00:2048:1::c629:d7a2', 'a real public address'],
    ['::ffff:8.8.8.8', 'a PUBLIC v4 address, mapped — must stay reachable'],
    ['::ffff:808:808', 'the same public address in hex'],
  ])('allows %s (%s)', (ip) => {
    // The refusal must not widen into "no IPv6 works". A guard that blocks
    // everything passes every test above and breaks every real crawl.
    expect(blocked(ip)).toBe(false)
  })
})
