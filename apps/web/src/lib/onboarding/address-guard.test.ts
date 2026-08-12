import { describe, expect, it } from 'vitest'

import { isPublicAddress } from './address-guard'

describe('isPublicAddress', () => {
  it('allows ordinary public IPv4', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true)
    expect(isPublicAddress('1.1.1.1')).toBe(true)
    expect(isPublicAddress('142.250.190.78')).toBe(true)
  })

  it.each([
    ['169.254.169.254', 'cloud metadata — the whole reason this file exists'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback, high end of the /8'],
    ['10.1.2.3', 'private /8'],
    ['172.16.0.1', 'private /12, first'],
    ['172.31.255.254', 'private /12, last'],
    ['192.168.1.1', 'private /16'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['0.0.0.0', 'this network'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
  ])('blocks %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it('does not over-block addresses adjacent to a private range', () => {
    // 172.15.x and 172.32.x sit either side of the /12 and are public.
    expect(isPublicAddress('172.15.255.255')).toBe(true)
    expect(isPublicAddress('172.32.0.1')).toBe(true)
    expect(isPublicAddress('100.63.255.255')).toBe(true)
    expect(isPublicAddress('100.128.0.1')).toBe(true)
  })

  it('handles the /4 masks that a signed shift would get wrong', () => {
    // 224.0.0.0/4 and 240.0.0.0/4 have masks whose high bit is set. Built with
    // `-1 << 28` they are negative and every comparison flips.
    expect(isPublicAddress('223.255.255.255')).toBe(true)
    expect(isPublicAddress('224.0.0.0')).toBe(false)
    expect(isPublicAddress('239.255.255.255')).toBe(false)
    expect(isPublicAddress('240.0.0.0')).toBe(false)
  })

  it('allows ordinary public IPv6', () => {
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
    expect(isPublicAddress('2001:4860:4860::8888')).toBe(true)
  })

  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'unique-local'],
    ['fd12:3456::1', 'unique-local'],
    ['fe80::1', 'link-local'],
    ['ff02::1', 'multicast'],
    ['2001:db8::1', 'documentation'],
  ])('blocks IPv6 %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it('judges an IPv4-mapped IPv6 address by its IPv4 half', () => {
    // ::ffff:169.254.169.254 reaches exactly the same metadata endpoint.
    expect(isPublicAddress('::ffff:169.254.169.254')).toBe(false)
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false)
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true)
  })

  it('blocks NAT64, which reaches IPv4 space through a v6 literal', () => {
    expect(isPublicAddress('64:ff9b::a00:1')).toBe(false)
  })

  it('ignores a zone index', () => {
    expect(isPublicAddress('fe80::1%eth0')).toBe(false)
  })

  it('rejects anything unparseable rather than defaulting to allow', () => {
    expect(isPublicAddress('')).toBe(false)
    expect(isPublicAddress('not-an-ip')).toBe(false)
    expect(isPublicAddress('999.1.1.1')).toBe(false)
    expect(isPublicAddress('1.2.3')).toBe(false)
  })

  it('honours an explicit family', () => {
    expect(isPublicAddress('8.8.8.8', 4)).toBe(true)
    expect(isPublicAddress('127.0.0.1', 4)).toBe(false)
    expect(isPublicAddress('::1', 6)).toBe(false)
  })
})
