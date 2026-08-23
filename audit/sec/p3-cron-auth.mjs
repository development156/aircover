/**
 * The cron routes are PUBLIC URLs that mutate user data — /api/cron/loop plans a
 * week and /api/cron/sweeps moves credits. `isAuthorizedCronRequest` is the only
 * thing in front of them, and it is documented to fail CLOSED when CRON_SECRET is
 * unset. This environment has no CRON_SECRET, which makes it the exact condition
 * worth measuring rather than reading.
 *
 * GET, because these are GET routes — a POST answers 405 on the METHOD, which
 * proves nothing about authorisation and would be a code read wearing a
 * measurement's clothes.
 */
const BASE = process.env.SEC_BASE ?? 'http://127.0.0.1:3253'
const ROUTES = ['/api/cron/sweeps', '/api/cron/metrics', '/api/cron/loop', '/api/cron/playbooks']
const CASES = [
  ['no header', {}],
  ['Bearer wrong', { Authorization: 'Bearer wrong-secret-entirely' }],
  ['Bearer empty', { Authorization: 'Bearer ' }],
  ['malformed bearer', { Authorization: 'Bearer aaa.bbb.ccc' }],
  ['not a bearer', { Authorization: 'Basic abc' }],
]
for (const route of ROUTES) {
  const out = []
  for (const [name, headers] of CASES) {
    try {
      const res = await fetch(`${BASE}${route}`, { headers, redirect: 'manual' })
      out.push(`${name}=${res.status}`)
    } catch (e) {
      out.push(`${name}=ERR ${e.cause?.code ?? e.message}`)
    }
  }
  console.log(`${route.padEnd(24)} ${out.join('  ')}`)
}
