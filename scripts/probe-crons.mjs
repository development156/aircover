#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CONTROL_PATH,
  DOCUMENT_HEADERS,
  judgeControl,
  judgeCron,
  summariseCrons,
} from './lib/cron-probe.mjs'

/**
 * Ask a deployment whether its scheduled jobs are actually reachable.
 *
 *   node scripts/probe-crons.mjs [https://host]
 *
 * Exits non-zero when any declared cron cannot be reached, so a deploy check can
 * gate on it. Sends NO cron secret, so it can never trigger a job — a reachable
 * route answers 401 and that 401 IS the pass.
 *
 * The paths come from `apps/web/vercel.json` in THIS working tree, which is the
 * point rather than a limitation: the question being asked is "does the thing we
 * think we scheduled exist over there", and the deployment cannot be asked what
 * it believes it schedules.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const HOST = (process.argv[2] ?? process.env.PROBE_HOST ?? 'https://app.sahodalabs.com').replace(
  /\/$/,
  '',
)
const TIMEOUT_MS = 30_000

const vercel = JSON.parse(readFileSync(resolve(HERE, '../apps/web/vercel.json'), 'utf8'))
const crons = vercel.crons ?? []

async function probe(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${HOST}${path}`, {
      // Manual: a redirect is the ANSWER here, not a hop to follow. Vercel cron
      // does not follow them either, so following one would measure a browser
      // rather than the scheduler.
      redirect: 'manual',
      headers: DOCUMENT_HEADERS,
      signal: controller.signal,
    })
    return {
      status: response.status,
      location: response.headers.get('location') ?? '',
      body: (await response.text()).slice(0, 200),
    }
  } catch (error) {
    return { status: 0, location: '', body: '', error: error.message }
  } finally {
    clearTimeout(timer)
  }
}

console.log(`\n  cron reachability · ${HOST}`)
console.log(`  ${crons.length} scheduled in apps/web/vercel.json, no cron secret sent\n`)

// The control FIRST. Everything after it is read in its light.
const control = await probe(CONTROL_PATH)
const controlVerdict = judgeControl(control)
console.log(`  CONTROL  ${CONTROL_PATH}  ${control.status}  ${controlVerdict.reason}\n`)

if (!controlVerdict.ok) {
  console.error('  Refusing to report verdicts: the discriminator is not sound.')
  process.exit(2)
}

const verdicts = []
for (const cron of crons) {
  const result = await probe(cron.path)
  const verdict = judgeCron(cron.path, result, control)
  verdicts.push(verdict)
  console.log(
    `  ${(verdict.ok ? 'PASS' : 'FAIL').padEnd(5)}${cron.path.padEnd(20)} ${String(verdict.status).padEnd(4)} ` +
      `${verdict.state.padEnd(15)} (${cron.schedule})`,
  )
  if (!verdict.ok) console.log(`         ${verdict.reason}`)
}

const summary = summariseCrons(verdicts)
console.log(`\n  ${summary.passed}/${summary.total} scheduled crons are reachable\n`)
if (!summary.ok) process.exit(1)
