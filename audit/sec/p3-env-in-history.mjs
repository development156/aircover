import { execSync } from 'node:child_process'
import { WT } from '../lib/env.mjs'
const run = (c) => execSync(c, { cwd: WT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

console.log('── every path ever committed on any ref that looks like an env file ──')
const paths = new Set(
  run('git log --all --pretty=format: --name-only --diff-filter=A')
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p && /(^|\/)\.env($|\.)|\.env\.(local|production|development)/.test(p)),
)
console.log(paths.size === 0 ? '  none' : [...paths].map((p) => `  ${p}`).join('\n'))

console.log('\n── tracked right now ──')
const tracked = run('git ls-files')
  .split('\n')
  .filter((p) => /(^|\/)\.env($|\.)/.test(p))
console.log(tracked.length === 0 ? '  none' : tracked.map((p) => `  ${p}`).join('\n'))

console.log('\n── NEXT_PUBLIC_* values, which SHIP TO THE BROWSER by design ──')
const { env } = await import('../lib/env.mjs')
for (const [k, v] of Object.entries(env)) {
  if (!k.startsWith('NEXT_PUBLIC_')) continue
  // Names and shapes only. A publishable key is meant to be here; a service key
  // or a secret under this prefix is a disclosure.
  const suspicious =
    /secret|service_role|private|password/i.test(k) ||
    (/^eyJ/.test(v) === false && /^sk[-_]/.test(v))
  console.log(
    `  ${k.padEnd(40)} len=${String(v.length).padStart(4)}  ${suspicious ? '⚠ LOOKS SECRET' : 'ok'}`,
  )
}
