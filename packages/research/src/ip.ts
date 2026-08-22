/**
 * IS THIS ADDRESS ONE WE MAY OPEN A SOCKET TO?
 *
 * ── WHY THIS FILE EXISTS AS ARITHMETIC AND NOT AS REGEXES ────────────────────
 * The version this replaces classified IPv6 with three prefix regexes and one
 * dotted-quad match:
 *
 *     const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr)
 *
 * That branch COULD NEVER FIRE on the path it was written for, and the proof is
 * one line of Node:
 *
 *     new URL('http://[::ffff:169.254.169.254]/').hostname  →  '[::ffff:a9fe:a9fe]'
 *
 * WHATWG URL serialises an IPv6 literal as hextets. The human-typed dotted form
 * the regex was built around is not a string this code is ever handed — the
 * parser has already rewritten it into hex. So `::ffff:a9fe:a9fe`, which IS the
 * cloud metadata endpoint, fell through every branch and was returned as PUBLIC.
 * The same hole was reachable without any URL literal at all: a hostname whose
 * AAAA record answers `::ffff:a9fe:a9fe` is handed to the guard by DNS in exactly
 * that form.
 *
 * A regex over a textual address will keep missing a form, because the forms are
 * a property of the address FAMILY and not of its spelling. So: parse to numbers
 * once, then decide with arithmetic. Every IPv4-bearing IPv6 form — mapped,
 * compatible, translated, 6to4, NAT64 — is resolved to the 32 bits it carries and
 * handed to the same IPv4 classifier, which is the only place ranges are listed.
 *
 * ── FAIL CLOSED, INCLUDING ON GIBBERISH ──────────────────────────────────────
 * An address this file cannot parse is PRIVATE. The version this replaces did
 * that for IPv4 and not for IPv6 — an unparseable v6 string fell past three
 * prefix tests and returned "public", so a malformed address was safer to send a
 * request at than a well-formed one.
 *
 * ── ONE LIST, NOT TWO ────────────────────────────────────────────────────────
 * `apps/web/src/lib/onboarding/address-guard.ts` held a second, divergent copy:
 * it knew NAT64 and 2001:db8 which this did not, and did not know 6to4 which
 * this does. It had no production importer left — the research package
 * superseded it — so it is deleted and its ranges and its test cases are folded
 * in here. Two lists is the shape where a fix closes one input and its sibling
 * walks through.
 */

/** A dotted quad as its 32-bit value, or null. Nothing else is accepted. */
export function parseIpv4(address: string): number | null {
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

/**
 * [network, prefix] pairs no customer-supplied URL may reach.
 *
 * `192.88.99.0/24` is here and was in neither predecessor: it is the 6to4 relay
 * anycast prefix, which is a router, not a website.
 */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — the cloud metadata endpoint lives here
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. the 255.255.255.255 broadcast
]

function inV4Range(value: number, network: string, prefix: number): boolean {
  const base = parseIpv4(network)
  if (base === null) return true
  // Compared by BLOCK NUMBER rather than by a bitmask.
  //
  // The comment carried over from the guard this replaces said a signed mask
  // makes `224.0.0.0/4` "silently stop matching". MEASURED, and it does not:
  // `(value & mask) === (base & mask)` puts BOTH sides through the same ToInt32,
  // so the sign cancels — 0 divergences across 3,000,075 comparisons over every
  // range in this list. The `>>> 0` that claim justified was never load-bearing.
  // Division is kept because it needs no such argument to be read as correct,
  // and the claim is corrected here rather than repeated.
  const size = 2 ** (32 - prefix)
  return Math.floor(value / size) === Math.floor(base / size)
}

/** True for anything we refuse to connect to, INCLUDING what we cannot parse. */
export function isPrivateIpv4(address: string): boolean {
  const value = parseIpv4(address)
  if (value === null) return true
  return BLOCKED_V4.some(([network, prefix]) => inV4Range(value, network, prefix))
}

/**
 * An IPv6 address as its eight hextets, or null.
 *
 * Handles `::` compression and a trailing dotted quad (`::ffff:1.2.3.4`), which
 * a human may type even though `new URL` will have rewritten it by the time this
 * is reached from that direction. A zone id (`%eth0`) is stripped: it names an
 * interface, and an address that needs one is by definition link-local.
 */
export function parseIpv6(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0]!
  if (text === '') return null

  // A trailing dotted quad becomes the last two hextets.
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  if (dotted) {
    const v4 = parseIpv4(dotted[2]!)
    if (v4 === null) return null
    const high = Math.floor(v4 / 65536).toString(16)
    const low = (v4 % 65536).toString(16)
    text = `${dotted[1]}${high}:${low}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null

  const toHextets = (part: string): number[] | null => {
    if (part === '') return []
    const out: number[] = []
    for (const piece of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null
      out.push(parseInt(piece, 16))
    }
    return out
  }

  if (halves.length === 1) {
    const all = toHextets(text)
    return all && all.length === 8 ? all : null
  }

  const head = toHextets(halves[0]!)
  const tail = toHextets(halves[1]!)
  if (head === null || tail === null) return null
  const gap = 8 - head.length - tail.length
  // `::` must stand for AT LEAST one zero group; a "compression" of nothing is
  // not a valid address and must not be accepted as one.
  if (gap < 1) return null
  return [...head, ...Array<number>(gap).fill(0), ...tail]
}

/** The IPv4 address an IPv6 form carries, when it carries one. */
function embeddedIpv4(h: number[]): number | null {
  const zeros = (from: number, to: number) => h.slice(from, to).every((x) => x === 0)
  const join = (a: number, b: number) => a * 65536 + b

  // ::ffff:a.b.c.d — IPv4-mapped. This is the form `new URL` produces.
  if (zeros(0, 5) && h[5] === 0xffff) return join(h[6]!, h[7]!)
  // ::ffff:0:a.b.c.d — IPv4-translated (RFC 2765).
  if (zeros(0, 4) && h[4] === 0xffff && h[5] === 0) return join(h[6]!, h[7]!)
  // ::a.b.c.d — deprecated IPv4-compatible. `::` and `::1` are handled above it.
  if (zeros(0, 6)) return join(h[6]!, h[7]!)
  // 2002:a.b.c.d:: — 6to4. The v4 address is the SECOND and THIRD hextets.
  if (h[0] === 0x2002) return join(h[1]!, h[2]!)
  // 64:ff9b::a.b.c.d — the well-known NAT64 prefix.
  if (h[0] === 0x0064 && h[1] === 0xff9b) return join(h[6]!, h[7]!)
  return null
}

export function isPrivateIpv6(address: string): boolean {
  const h = parseIpv6(address)
  if (h === null) return true // unparseable is refused, not assumed public

  if (h.every((x) => x === 0)) return true // :: unspecified
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true // ::1 loopback

  const embedded = embeddedIpv4(h)
  if (embedded !== null) {
    // 64:ff9b:1::/48 is the LOCAL-use NAT64 prefix — a translator inside the
    // network, so the v4 address behind it says nothing about reachability.
    if (h[0] === 0x0064 && h[1] === 0xff9b && h[2] !== 0) return true
    const octets = [
      Math.floor(embedded / 16777216),
      Math.floor(embedded / 65536) % 256,
      Math.floor(embedded / 256) % 256,
      embedded % 256,
    ]
    return isPrivateIpv4(octets.join('.'))
  }

  if ((h[0]! & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((h[0]! & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((h[0]! & 0xffc0) === 0xfec0) return true // fec0::/10 deprecated site-local
  if ((h[0]! & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (h[0] === 0x0100 && h.slice(1, 4).every((x) => x === 0)) return true // 100::/64 discard
  if (h[0] === 0x2001 && h[1] === 0x0000) return true // 2001::/32 Teredo — a tunnel
  if (h[0] === 0x2001 && h[1] === 0x0002 && h[2] === 0) return true // benchmarking
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true // documentation
  if ((h[0]! & 0xfff0) === 0x3ff0) return true // 3fff::/20 documentation (RFC 9637)
  return false
}

/**
 * True only for an address we refuse to connect to.
 *
 * `family` is what `dns.lookup` reported when there is one. When there is not,
 * the shape decides — and a string that is neither a dotted quad nor a parseable
 * IPv6 address is refused by both classifiers rather than by neither.
 */
export function isPrivateAddress(address: string, family?: number): boolean {
  if (!address) return true
  if (family === 4) return isPrivateIpv4(address)
  if (family === 6) return isPrivateIpv6(address)
  return address.includes(':') ? isPrivateIpv6(address) : isPrivateIpv4(address)
}

/**
 * The hostname as an address, when it already is one. `null` for a name.
 *
 * Lives beside the classifier because both the URL guard and the socket guard
 * need it and a second copy is the same two-lists defect this file was written
 * to end. A URL keeps the brackets on an IPv6 literal (`[::1]`); the classifier
 * wants the bare address.
 */
export function ipLiteral(hostname: string): { address: string; family: number } | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return { address: hostname, family: 4 }
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return { address: hostname.slice(1, -1), family: 6 }
  }
  if (hostname.includes(':')) return { address: hostname, family: 6 }
  return null
}
