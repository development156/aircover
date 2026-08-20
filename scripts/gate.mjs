#!/usr/bin/env node
/**
 * The five-part gate, as a program rather than a shell one-liner.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ──────────────────────────────────────────────────
 * `pnpm gate` used to be five commands joined by `&&`, and it produced thousands of lines,
 * so everybody piped it: `pnpm gate | tail -60`. A shell pipeline reports the exit status
 * of the LAST command in it. `tail` always succeeds. So a gate that failed on stage one
 * reported success, and did so silently — MEASURED on 2026-08-19, when a branch whose
 * `turbo build` exited 137 was read as green.
 *
 * `set -o pipefail` is not the fix here: this repo's sessions run fish, which has no such
 * option, and a rule that only holds in one shell is a rule that will be broken. Nor can a
 * program make a pipe return its own status — that is the shell's decision, not the
 * program's.
 *
 * So the fix is to remove the REASON to pipe, and to make the verdict survive being piped
 * anyway. Four things, together:
 *
 *   1. Each stage's full output goes to `.gate/<n>-<stage>.log`, and only a one-line
 *      summary reaches the terminal — so there is nothing to `tail` away.
 *   2. On failure the tail of the FAILING stage is printed automatically, which is the
 *      only part anyone wanted from `tail -60`.
 *   3. The verdict is written to STDERR as well as stdout. `| tail -60` redirects stdout
 *      only, so a piped failure is still shouted at the terminal.
 *   4. The verdict banner is the LAST line of stdout, so it survives `tail -n` for any n,
 *      and `.gate/verdict.json` records it for anything reading by machine.
 *
 * And when stdout is not a terminal, the runner says out loud that the shell just reported
 * the pipe's status and not the gate's.
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────────────────
 * It does not decide what the gate is. The five stages below are exactly the five the
 * `gate` script has always run, in the same order, with the same commands.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOG_DIR = path.join(ROOT, '.gate')

/**
 * How many lines of a failing stage to print.
 *
 * Sixty, because that is the number every session was already typing — the point is that
 * it now arrives without a pipe, not that it is a different number.
 */
const TAIL_LINES = 60

/**
 * `--concurrency=1`. This is a shared 15 GB machine that regularly runs four or five
 * worktrees at once, and turbo's default fans out to the core count. MEASURED 2026-08-19:
 * `turbo build` exited 137 — SIGKILL from the kernel OOM killer — and exited 0 on retry
 * with no change in between, which is a gate that answers a question about the machine
 * while appearing to answer one about the code.
 */
const TURBO = ['--concurrency=1']

const STAGES = [
  {
    name: 'turbo-typecheck-lint-test',
    cmd: 'pnpm',
    args: ['turbo', 'run', 'typecheck', 'lint', 'test', ...TURBO],
  },
  { name: 'vitest-root', cmd: 'pnpm', args: ['exec', 'vitest', 'run'] },
  { name: 'turbo-smoke', cmd: 'pnpm', args: ['turbo', 'run', 'test:smoke', ...TURBO] },
  { name: 'prettier-check', cmd: 'pnpm', args: ['exec', 'prettier', '--check', '.'] },
  { name: 'turbo-build', cmd: 'pnpm', args: ['turbo', 'run', 'build', ...TURBO] },
]

function parseArgs(argv) {
  const only = []
  let list = false
  for (const arg of argv) {
    if (arg === '--list') list = true
    else if (arg.startsWith('--only=')) only.push(...arg.slice('--only='.length).split(','))
    else throw new Error(`unknown argument: ${arg}`)
  }
  return { only, list }
}

function runStage(stage, index, total) {
  return new Promise((resolve) => {
    const logPath = path.join(LOG_DIR, `${index + 1}-${stage.name}.log`)
    const log = fs.createWriteStream(logPath)
    const startedAt = Date.now()
    process.stdout.write(`[${index + 1}/${total}] ${stage.name} … `)
    const child = spawn(stage.cmd, stage.args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(log)
    child.stderr.pipe(log)
    child.on('error', (error) => {
      log.end()
      resolve({ stage, logPath, code: 127, ms: Date.now() - startedAt, spawnError: error.message })
    })
    child.on('close', (code, signal) => {
      log.end(() => {
        // A signal is not an exit code. 137 is SIGKILL, which on this machine means the
        // OOM killer, and reading it as an ordinary failure sends the next hour into the
        // wrong file. Recorded so the summary can name it.
        resolve({
          stage,
          logPath,
          code: code === null ? 128 + (signal === 'SIGKILL' ? 9 : 1) : code,
          signal: signal ?? null,
          ms: Date.now() - startedAt,
        })
      })
    })
  })
}

function tailOf(logPath, lines) {
  if (!fs.existsSync(logPath)) return '(no output captured)'
  const all = fs.readFileSync(logPath, 'utf8').split('\n')
  return all.slice(Math.max(0, all.length - lines)).join('\n')
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`
}

async function main() {
  const { only, list } = parseArgs(process.argv.slice(2))
  const stages = only.length > 0 ? STAGES.filter((s) => only.includes(s.name)) : STAGES

  if (list) {
    for (const [i, s] of STAGES.entries())
      console.log(`${i + 1}. ${s.name}: ${s.cmd} ${s.args.join(' ')}`)
    return 0
  }
  if (stages.length === 0) throw new Error(`--only matched no stage. Try --list.`)

  fs.rmSync(LOG_DIR, { recursive: true, force: true })
  fs.mkdirSync(LOG_DIR, { recursive: true })

  const results = []
  let failed = null
  for (const [i, stage] of stages.entries()) {
    const result = await runStage(stage, i, stages.length)
    results.push(result)
    if (result.code === 0) {
      process.stdout.write(`ok (${seconds(result.ms)})\n`)
    } else {
      process.stdout.write(
        `FAILED exit ${result.code}${result.signal ? ` (${result.signal})` : ''} (${seconds(result.ms)})\n`,
      )
      failed = result
      // Stop at the first failure, exactly as `&&` did. A gate that keeps going produces
      // a second failure caused by the first and buries the one that matters.
      break
    }
  }

  // ── `ok` MEANS THE WHOLE GATE, AND THIS IS WHERE THAT NEARLY WENT WRONG ────
  // The first draft computed only `skipped` — the stages that were SELECTED and did
  // not run. On `--only=prettier-check` that set is empty, so a one-stage run wrote
  // `ok: true` and `gate:verdict` announced GATE PASSED. That closes "no gate has
  // run" and leaves "a PARTIAL gate ran" reading as a full pass, which is the same
  // defect one door down — and every proof run of this file used `--only`, which is
  // exactly why it was invisible from here. `notSelected` is the missing half.
  const notSelected = STAGES.filter((s) => !stages.includes(s)).map((s) => s.name)
  const verdict = {
    /** True only when EVERY stage ran and passed. A partial run is never `ok`. */
    ok: failed === null && notSelected.length === 0,
    /** Whether everything that DID run passed. Not the same claim. */
    allPassed: failed === null,
    ranAt: new Date().toISOString(),
    stages: results.map((r) => ({
      name: r.stage.name,
      code: r.code,
      signal: r.signal ?? null,
      ms: r.ms,
    })),
    /** Selected, but never reached — the gate stopped at a failure before them. */
    skipped: stages.slice(results.length).map((s) => s.name),
    /** Never selected at all, because `--only` excluded them. */
    notSelected,
    failedStage: failed ? failed.stage.name : null,
  }
  fs.writeFileSync(path.join(LOG_DIR, 'verdict.json'), JSON.stringify(verdict, null, 2) + '\n')

  console.log('')
  if (notSelected.length > 0) {
    // Printed on a PASSING partial run too. The dangerous case is not the failure —
    // it is the green one that looks like a full gate.
    console.log(`NOT SELECTED (--only): ${notSelected.join(', ')}`)
  }
  if (failed !== null) {
    console.log(`── last ${TAIL_LINES} lines of ${failed.stage.name} ` + '─'.repeat(20))
    console.log(tailOf(failed.logPath, TAIL_LINES))
    console.log('─'.repeat(70))
    if (verdict.skipped.length > 0) {
      // Never report an unrun stage as passed.
      console.log(`NOT RUN (the gate stopped here): ${verdict.skipped.join(', ')}`)
    }
  }
  console.log(
    `logs: ${path.relative(process.cwd(), LOG_DIR)}/  ·  verdict: ${path.relative(process.cwd(), path.join(LOG_DIR, 'verdict.json'))}`,
  )

  // ── THE VERDICT, THREE WAYS ────────────────────────────────────────────────────────
  const banner =
    failed !== null
      ? `GATE FAILED — ${failed.stage.name} exited ${failed.code}`
      : notSelected.length > 0
        ? `PARTIAL GATE — ${results.length} of ${STAGES.length} stages ran and passed`
        : 'GATE PASSED'
  if (!process.stdout.isTTY) {
    // stdout is a pipe or a file. If it is a pipe, the shell has already decided to report
    // the PIPE's status, and there is nothing this process can do about that — so say so.
    console.error(
      `\n!! ${banner}\n!! stdout is not a terminal. If you piped this (\`pnpm gate | tail\`), your shell will\n` +
        `!! report the PIPE's exit status, not the gate's. Read this line, or .gate/verdict.json.\n`,
    )
  }
  // Last line of stdout, so it survives `tail -n` for any n.
  console.log(banner)
  return failed === null ? 0 : failed.code
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('gate runner failed: ' + (error instanceof Error ? error.message : String(error)))
    process.exit(1)
  })
