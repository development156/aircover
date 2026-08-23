/**
 * SECRETS — in git history, in the client bundle, in a log, in an error.
 *
 * The VALUES are read from the env files this worktree actually uses and then
 * searched for LITERALLY. A pattern hunt finds `sk-…`-shaped strings; only the
 * real value can tell you whether THIS deployment's key is the one exposed.
 * Nothing here prints a secret: matches are reported by NAME and by location.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { env, WT } from '../lib/env.mjs'

/** Long enough to be a credential rather than a flag. */
const MIN = 16
const PUBLIC_PREFIXES = ['NEXT_PUBLIC_', 'SAHODA_E2E_']

const secrets = Object.entries(env)
  .filter(
    ([k, v]) =>
      typeof v === 'string' && v.length >= MIN && !PUBLIC_PREFIXES.some((p) => k.startsWith(p)),
  )
  // A URL that is only a hostname is not a secret; a connection string with a
  // password in it is. Keep both — the password is inside the value either way.
  .map(([k, v]) => ({ name: k, value: v }))

console.log(`checking ${secrets.length} secret-shaped env values (names only are ever printed)\n`)

// ── 1. the client bundle ────────────────────────────────────────────────────
const staticDir = path.join(WT, 'apps', 'web', '.next', 'static')
function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full) : [full]
  })
}
const bundleFiles = walk(staticDir)
const inBundle = []
for (const file of bundleFiles) {
  const text = fs.readFileSync(file, 'utf8')
  for (const s of secrets) if (text.includes(s.value)) inBundle.push({ name: s.name, file })
}
console.log(`CLIENT BUNDLE — ${bundleFiles.length} files under .next/static`)
console.log(
  inBundle.length === 0
    ? '  clean'
    : inBundle.map((h) => `  LEAK ${h.name} in ${h.file}`).join('\n'),
)

// ── 2. git history, every commit on every ref ───────────────────────────────
console.log('\nGIT HISTORY (git log -S over all refs)')
let historyHits = 0
for (const s of secrets) {
  let out = ''
  try {
    out = execSync(`git log --all --oneline -S ${JSON.stringify(s.value)} -- . | head -5`, {
      cwd: WT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }).trim()
  } catch {
    out = ''
  }
  if (out) {
    historyHits += 1
    console.log(`  IN HISTORY  ${s.name}:`)
    for (const line of out.split('\n')) console.log(`      ${line}`)
  }
}
if (historyHits === 0) console.log('  clean')

// ── 3. tracked files ────────────────────────────────────────────────────────
console.log('\nTRACKED FILES (git grep over the working tree)')
let trackedHits = 0
for (const s of secrets) {
  let out = ''
  try {
    out = execSync(`git grep -l -F ${JSON.stringify(s.value)} -- . | head -5`, {
      cwd: WT,
      encoding: 'utf8',
    }).trim()
  } catch {
    out = ''
  }
  if (out) {
    trackedHits += 1
    console.log(`  TRACKED  ${s.name}: ${out.split('\n').join(', ')}`)
  }
}
if (trackedHits === 0) console.log('  clean')

console.log(`\nsummary: bundle=${inBundle.length}  history=${historyHits}  tracked=${trackedHits}`)
