#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import { MutationHarnessError, runMutants } from './lib/mutation-harness.mjs'

/**
 * Run a mutation spec (SL-064).
 *
 *   node scripts/mutation-check.mjs mutations/rollup-red-rule.mjs
 *
 * A spec is a `.mjs` file with a default export:
 *
 *   export default {
 *     cwd: 'apps/web',                                   // relative to repo root
 *     command: 'pnpm vitest run src/lib/ops/rollup.test.ts',
 *     mutants: [
 *       { name: 'hasRed always false', file: 'apps/web/src/lib/ops/rollup.ts',
 *         find: 'hasRed: group.some(isRed),', replace: 'hasRed: false,' },
 *     ],
 *   }
 *
 * A mutant is KILLED when the command exits non-zero — the tests noticed the
 * code was broken. It SURVIVED on exit 0, which means those tests pass against
 * broken code and are not testing what they appear to test.
 *
 * WHY THIS IS A FILE AND NOT A SHELL ONE-LINER. It was a shell one-liner twice
 * on 2026-08-03 and both runs reported verdicts they had not earned: the backup
 * `cp` failed silently because the scratch directory did not exist, and the
 * loop carried on. A spec is reviewable, re-runnable, and diffable; the harness
 * underneath it refuses to print anything while a source file is still mutated.
 *
 * Exit codes: 0 all mutants killed · 1 one or more survived · 2 the run itself
 * failed (unrestored file, mutant never applied, unusable scratch directory).
 * 2 is the one that matters: it means this run proves nothing.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..')
const SCRATCH = resolve(REPO_ROOT, '.mutation-backups')

function die(message, code = 2) {
  console.error(`mutation-check: ${message}`)
  process.exit(code)
}

const specArg = process.argv[2]
if (!specArg) die('usage: node scripts/mutation-check.mjs <spec.mjs>')

const specPath = resolve(REPO_ROOT, specArg)
let spec
try {
  spec = (await import(pathToFileURL(specPath).href)).default
} catch (error) {
  die(`cannot load the spec ${specPath}: ${error.message}`)
}

if (!spec?.command || !Array.isArray(spec.mutants) || spec.mutants.length === 0) {
  die(`${specPath} must default-export { command, mutants: [...] } with at least one mutant.`)
}

const cwd = resolve(REPO_ROOT, spec.cwd ?? '.')

/** Exit code only. Whether a suite "failed" is the runner's judgement, not ours. */
function runCommand(command) {
  return new Promise((resolveRun) => {
    const child = spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('close', (code) => resolveRun({ code, output }))
  })
}

/** The runner's own summary line, so the report says what actually happened. */
function summarise(output) {
  const match = /Tests\s+(?:\d+ failed \| )?\d+ passed[^\n]*/.exec(output)
  return match ? match[0].replace(/\s+/g, ' ').trim() : 'no test summary found in the output'
}

try {
  const { report, results } = await runMutants({
    scratchDir: SCRATCH,
    mutants: spec.mutants.map((mutant) => ({
      ...mutant,
      file: resolve(REPO_ROOT, mutant.file),
    })),
    runTests: async (mutant) => {
      process.stderr.write(`mutation-check: ${mutant.name} … `)
      const { code, output } = await runCommand(spec.command)
      const killed = code !== 0
      process.stderr.write(`${killed ? 'killed' : 'SURVIVED'}\n`)
      return { killed, summary: summarise(output) }
    },
  })

  console.log(report)
  process.exit(results.every((result) => result.killed) ? 0 : 1)
} catch (error) {
  if (error instanceof MutationHarnessError) {
    // Loud, and exit 2: this run proves nothing, and the tree may need a hand.
    console.error(`\nmutation-check: ${error.message}`)
    process.exit(2)
  }
  throw error
}
