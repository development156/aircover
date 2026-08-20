#!/usr/bin/env node
/**
 * Re-assert the last gate's verdict as this process's exit code.
 *
 * The companion to `scripts/gate.mjs`. A shell pipeline reports the LAST command's status,
 * so `pnpm gate | tail -60` can never return the gate's own — that is the shell's rule and
 * no program can override it. This is the way back: run it AFTER the pipe and the real
 * verdict becomes an exit code again.
 *
 *     pnpm gate | tail -60 ; pnpm gate:verdict
 *
 * It refuses on a missing or unreadable verdict rather than passing. "No gate has run" and
 * "the gate passed" must never look alike — that is the same mistake in a new place.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERDICT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.gate',
  'verdict.json',
)

if (!fs.existsSync(VERDICT)) {
  console.error(
    'NO VERDICT: .gate/verdict.json does not exist — the gate has not run in this tree.',
  )
  process.exit(1)
}

let verdict
try {
  verdict = JSON.parse(fs.readFileSync(VERDICT, 'utf8'))
} catch (error) {
  console.error('UNREADABLE VERDICT: ' + (error instanceof Error ? error.message : String(error)))
  process.exit(1)
}

const passed = verdict.ok === true
const notSelected = verdict.notSelected ?? []
const stages = (verdict.stages ?? []).map((s) => `${s.name}=${s.code}`).join(' ')

// THREE outcomes, not two. A `--only` run that passed everything it was ASKED to run
// is not a passed gate, and keeping those apart is this file's whole job: "the gate
// passed" and "part of the gate passed" must never share an exit code.
const headline =
  verdict.failedStage != null
    ? `GATE FAILED at ${verdict.failedStage}`
    : notSelected.length > 0
      ? 'PARTIAL GATE — some stages were never selected'
      : 'GATE PASSED'

console.log(`${headline} (ran ${verdict.ranAt})`)
console.log(`  stages: ${stages}`)
if ((verdict.skipped ?? []).length > 0) console.log(`  NOT RUN: ${verdict.skipped.join(', ')}`)
if (notSelected.length > 0) console.log(`  NOT SELECTED: ${notSelected.join(', ')}`)
process.exit(passed ? 0 : 1)
