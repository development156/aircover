/**
 * Is an IP address one we are willing to send a user-supplied URL at?
 *
 * The onboarding URL door lets anyone type a hostname that this server then
 * fetches. Without this, `http://169.254.169.254/latest/meta-data/` — or any
 * hostname whose DNS record points there — reads the deployment's cloud
 * credentials into a Brand Brain. A hostname denylist does not help: the check
 * has to be on the ADDRESS, after resolution.
 *
 * Pure and exported so the ranges are testable without a socket.
 */

/** Parse dotted-quad IPv4. Returns the 32-bit value, or null. */
function parseIpv4(address: string): number | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null

  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

/** [network, prefix length] pairs that must never be connected to. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — the cloud metadata endpoint lives here
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. 255.255.255.255 broadcast
]

function inV4Range(value: number, network: string, prefix: number): boolean {
  const base = parseIpv4(network)
  if (base === null) return false

  // The mask is built by subtraction, not `-1 << (32 - prefix)`: JS bitwise
  // operators work on SIGNED 32-bit ints, so a /4 mask built that way is a
  // negative number. `>>> 0` on both sides puts the comparison back in
  // unsigned space, where the addresses live.
  const mask = prefix === 0 ? 0 : 2 ** 32 - 2 ** (32 - prefix)
  return (value & mask) >>> 0 === (base & mask) >>> 0
}

function isPublicIpv4(address: string): boolean {
  const value = parseIpv4(address)
  if (value === null) return false
  return !BLOCKED_V4.some(([network, prefix]) => inV4Range(value, network, prefix))
}

function isPublicIpv6(address: string): boolean {
  const value = address.toLowerCase().split('%')[0]!

  if (value === '::' || value === '::1') return false
  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible forms tunnel the whole
  // v4 problem through a v6 literal, so they are judged as v4.
  const embedded = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value)
  if (embedded) return isPublicIpv4(embedded[1]!)

  if (/^f[cd]/.test(value)) return false // fc00::/7 unique-local
  if (/^fe[89ab]/.test(value)) return false // fe80::/10 link-local
  if (/^ff/.test(value)) return false // ff00::/8 multicast
  if (value.startsWith('2001:db8')) return false // documentation
  if (value.startsWith('64:ff9b')) return false // NAT64 — reaches v4 space
  return true
}

/** True only for an address that is safe to open a connection to. */
export function isPublicAddress(address: string, family?: number): boolean {
  if (!address) return false
  if (family === 4) return isPublicIpv4(address)
  if (family === 6) return isPublicIpv6(address)
  return address.includes(':') ? isPublicIpv6(address) : isPublicIpv4(address)
}
