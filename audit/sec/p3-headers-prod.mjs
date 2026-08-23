/**
 * The SAME question against the deployed origin. Absent locally is not absent in
 * production: Vercel adds HSTS at the edge on a custom domain, and reporting a
 * missing header from `next start` would be reporting a fact about my laptop.
 * GET on public pages only — nothing here writes.
 */
import { env } from '../lib/env.mjs'
const BASE = env.NEXT_PUBLIC_APP_URL
const WANTED = [
  'content-security-policy',
  'strict-transport-security',
  'x-frame-options',
  'referrer-policy',
  'x-content-type-options',
  'permissions-policy',
  'x-powered-by',
  'server',
]
console.log('origin:', BASE)
for (const path of ['/sign-in', '/embed/beta', '/design-system']) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' })
    console.log(`\n── ${path} → ${res.status} ──`)
    for (const h of WANTED) console.log(`  ${h.padEnd(28)} ${res.headers.get(h) ?? '(absent)'}`)
  } catch (e) {
    console.log(`\n── ${path} → unreachable: ${e.cause?.code ?? e.message}`)
  }
}
