/**
 * P4 — every advisory, with the question that actually matters attached:
 * IS THE VULNERABLE PATH REACHABLE?
 *
 * A critical CVE in a package nothing calls is a different fact from a moderate
 * one on the publish path, and an advisory list that does not say which is which
 * is a list nobody can act on. So each advisory is resolved to the dependency
 * chain that pulled it in, and that chain is labelled `runtime` or `dev` from the
 * workspace package.json that declares its root.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

import { WT } from '../lib/env.mjs'

const raw = fs.readFileSync(process.argv[2], 'utf8')
// pnpm audit --json emits one object; older versions emit ndjson. Accept both.
const report =
  raw.trim().startsWith('{') && !raw.includes('\n{')
    ? JSON.parse(raw)
    : JSON.parse(
        raw
          .trim()
          .split('\n')
          .filter((l) => l.startsWith('{'))
          .pop(),
      )

const advisories = Object.values(report.advisories ?? {})
console.log(`advisories: ${advisories.length}`)
const bySeverity = {}
for (const a of advisories) bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1
console.log('by severity:', JSON.stringify(bySeverity))

/** Which workspace package declares the root of this chain, and is it a devDependency? */
const manifests = new Map()
function declaredIn(rootName) {
  const dirs = [
    '.',
    'apps/web',
    'apps/jobs',
    ...fs.readdirSync(path.join(WT, 'packages')).map((p) => `packages/${p}`),
  ]
  for (const dir of dirs) {
    const file = path.join(WT, dir, 'package.json')
    if (!fs.existsSync(file)) continue
    if (!manifests.has(file)) manifests.set(file, JSON.parse(fs.readFileSync(file, 'utf8')))
    const m = manifests.get(file)
    if (m.dependencies?.[rootName]) return { where: dir, kind: 'RUNTIME' }
    if (m.devDependencies?.[rootName]) return { where: dir, kind: 'dev' }
  }
  return null
}

console.log('')
for (const a of advisories.sort((x, y) => (x.severity < y.severity ? 1 : -1))) {
  const paths = (a.findings ?? []).flatMap((f) => f.paths ?? [])
  const roots = [...new Set(paths.map((p) => p.split('>')[1] ?? p.split('>')[0]))].filter(Boolean)
  const homes = roots.map((r) => {
    const d = declaredIn(r)
    return d ? `${r} (${d.kind} in ${d.where})` : `${r} (transitive only)`
  })
  console.log(`[${String(a.severity).toUpperCase()}] ${a.module_name} — ${a.title}`)
  console.log(`   vulnerable: ${a.vulnerable_versions}   patched: ${a.patched_versions}`)
  console.log(`   pulled in by: ${homes.slice(0, 4).join('; ') || '(unresolved)'}`)
  if (a.cves?.length) console.log(`   ${a.cves.join(', ')}`)
  console.log('')
}
void execSync
