#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderStatusPage } from './lib/status-page.mjs'

/**
 * Build the independent status page.
 *
 *   node scripts/build-status-page.mjs [https://host] [out.html]
 *
 * Runs the two read-only probes as SUBPROCESSES and reports their exit codes.
 * Subprocesses rather than imports on purpose: a probe that throws must not take
 * the page down with it, because a status page that fails to build is a status
 * page showing yesterday's news with no warning.
 *
 * Exit code is always 0. This builds a page; it does not decide whether anyone
 * should be woken. The page says what failed.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const HOST = (process.argv[2] ?? process.env.PROBE_HOST ?? 'https://app.sahodalabs.com').replace(
  /\/$/,
  '',
)
const OUT = resolve(process.argv[3] ?? resolve(HERE, '../public/status/index.html'))
const BUILT_AT = new Date().toISOString()

const firstLine = (text, fallback) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1) ?? fallback

function probe(name, script, detailOnPass) {
  try {
    const out = execFileSync('node', [resolve(HERE, script), HOST], { encoding: 'utf8' })
    return { name, ok: true, detail: detailOnPass(out) }
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`
    // Exit 2 from probe-production means "could not measure" — Vercel's
    // protection wall answered, not the app. That is `null`, never `false`:
    // reporting it as an outage is the cry-wolf failure these probes exist to end.
    if (error.status === 2) return { name, ok: null, detail: firstLine(out, 'could not measure') }
    return { name, ok: false, detail: firstLine(out, `exit ${error.status}`) }
  }
}

const checks = [
  probe(
    'Public routes',
    'probe-production.mjs',
    (out) => out.match(/(\d+\/\d+ routes behave)/)?.[1] ?? 'all routes behave',
  ),
  probe(
    'Scheduled jobs reachable',
    'probe-crons.mjs',
    (out) => out.match(/(\d+\/\d+ scheduled crons are reachable)/)?.[1] ?? 'all crons reachable',
  ),
]

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, renderStatusPage({ builtAt: BUILT_AT, checks, host: HOST }))
console.log(`status page → ${OUT}`)
for (const c of checks) {
  console.log(`  ${c.ok === null ? '—' : c.ok ? 'ok' : 'FAIL'}  ${c.name}: ${c.detail}`)
}
