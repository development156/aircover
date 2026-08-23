/** What a real response actually carries. Read off the wire, not off the config. */
const BASE = process.env.SEC_BASE ?? 'http://127.0.0.1:3253'
const WANTED = [
  'content-security-policy',
  'strict-transport-security',
  'x-frame-options',
  'referrer-policy',
  'x-content-type-options',
  'permissions-policy',
  'cross-origin-opener-policy',
  'x-powered-by',
]
for (const path of [
  '/sign-in',
  '/design-system',
  '/embed/beta',
  '/embed/lead',
  '/home',
  '/api/public/beta-apply',
]) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' })
  console.log(`\n── ${path}  → ${res.status} ──`)
  for (const h of WANTED) {
    const v = res.headers.get(h)
    console.log(`  ${h.padEnd(30)} ${v ?? '(absent)'}`)
  }
}
