/**
 * THE RULE: a customer-supplied address is judged at the socket, on every hop,
 * by arithmetic — and the default transport is the guarded one.
 *
 * Each mutant below is a defect this repository ACTUALLY SHIPPED, or the exact
 * shape of one. The first is the live hole: `globalThis.fetch` as the page
 * transport. The next five are the IPv6 classifier's old regexes, restored one
 * property at a time — every one of them returned "public" for the cloud
 * metadata endpoint in some spelling.
 *
 *   node scripts/mutation-check.mjs mutations/radar-ssrf.mjs
 *
 * ── ONE MUTANT WAS REMOVED, AND NOT BECAUSE IT SURVIVED ─────────────────────
 * "the /4 mask goes back to signed bitwise" survived, and the reason is that it
 * is an EQUIVALENT mutant: `(value & mask) === (base & mask)` sends both sides
 * through the same ToInt32, so the negative mask cancels. Checked exhaustively —
 * 0 divergences over 3,000,075 comparisons — before deleting it. A survivor that
 * is really an equivalence is noise in a report whose whole value is that a
 * survivor means something, so it is named here instead of left in to be
 * re-investigated every quarter.
 */
export default {
  mutants: [
    {
      name: 'the page transport defaults to the raw global fetch — the live defect',
      cwd: 'apps/jobs',
      command: 'pnpm vitest run src/radar/ssrf.test.ts',
      file: 'apps/jobs/src/radar/run.ts',
      find: 'fetch: options.fetchPage ?? (guardedFetch as FetchLike),',
      replace: 'fetch: options.fetchPage ?? (globalThis.fetch as unknown as FetchLike),',
    },
    {
      name: 'only the first hop is validated — a redirect walks into the metadata endpoint',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/guarded-fetch.test.ts',
      file: 'packages/research/src/guarded-fetch.ts',
      find: '      const url = await assertPublicUrl(current, options)',
      replace:
        '      const url = hop === 0 ? await assertPublicUrl(current, options) : new URL(current)',
    },
    {
      name: 'the caller gets to choose redirect handling back',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/guarded-fetch.test.ts',
      file: 'packages/research/src/guarded-fetch.ts',
      find: "const res = await transport(url.toString(), { ...init, redirect: 'manual' })",
      replace: 'const res = await transport(url.toString(), { ...init })',
    },
    {
      name: 'IPv4-mapped IPv6 is matched by the dead dotted-quad regex again',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/ip.test.ts src/guarded-fetch.test.ts',
      file: 'packages/research/src/ip.ts',
      find: '  if (zeros(0, 5) && h[5] === 0xffff) return join(h[6]!, h[7]!)',
      replace: '  if (false) return join(h[6]!, h[7]!)',
    },
    {
      name: '6to4 no longer resolves to the address it carries',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/ip.test.ts src/guarded-fetch.test.ts',
      file: 'packages/research/src/ip.ts',
      find: '  if (h[0] === 0x2002) return join(h[1]!, h[2]!)',
      replace: '  if (false) return join(h[1]!, h[2]!)',
    },
    {
      name: 'NAT64 no longer resolves to the address it carries',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/ip.test.ts src/guarded-fetch.test.ts',
      file: 'packages/research/src/ip.ts',
      find: '  if (h[0] === 0x0064 && h[1] === 0xff9b) return join(h[6]!, h[7]!)',
      replace: '  if (false) return join(h[6]!, h[7]!)',
    },
    {
      name: 'an unparseable IPv6 address is assumed public — the old fall-through',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/ip.test.ts',
      file: 'packages/research/src/ip.ts',
      find: '  if (h === null) return true // unparseable is refused, not assumed public',
      replace: '  if (h === null) return false',
    },
    {
      name: 'an unparseable IPv4 address is assumed public',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/ip.test.ts',
      file: 'packages/research/src/ip.ts',
      find: '  if (value === null) return true\n  return BLOCKED_V4.some',
      replace: '  if (value === null) return false\n  return BLOCKED_V4.some',
    },
    {
      name: 'the body cap is removed — a page that never stops sending is read whole',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/guarded-fetch.test.ts',
      file: 'packages/research/src/guarded-fetch.ts',
      find: '        const out = capped(res, maxBytes)',
      replace: '        const out = res',
    },
    {
      name: 'the cap is applied but never enforced against the arriving bytes',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/guarded-fetch.test.ts',
      file: 'packages/research/src/guarded-fetch.ts',
      find: '      if (total >= maxBytes) {',
      replace: '      if (false) {',
    },
    {
      name: 'an IP literal in the URL falls back to the DNS accident again',
      cwd: 'packages/research',
      command: 'pnpm vitest run src/guarded-fetch.test.ts',
      file: 'packages/research/src/safe-fetch.ts',
      find: '  const literal = ipLiteral(url.hostname)\n  if (literal) {',
      replace: '  const literal = null as ReturnType<typeof ipLiteral>\n  if (literal) {',
    },
    {
      name: 'the door stops refusing a private literal',
      cwd: 'apps/web',
      command: 'pnpm vitest run src/lib/radar/locator.test.ts',
      file: 'apps/web/src/lib/radar/locator.ts',
      find: '  if (literal && isPrivateAddress(literal.address, literal.family)) return null',
      replace: '  if (false) return null',
    },
  ],
}
