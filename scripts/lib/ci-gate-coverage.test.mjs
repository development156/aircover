import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * THE CI WORKFLOW AND `scripts/gate.mjs` MUST AGREE ABOUT WHAT THE GATE IS.
 *
 * ── WHY DERIVATION ALONE IS NOT ENOUGH, AND WHY A LIST IS NAMED ─────────────
 * `.github/workflows/gate.yml` runs three of the gate's five stages and states
 * why it skips the other two. That is a defensible decision today and a lie the
 * moment somebody adds a sixth stage: the workflow would go on running three,
 * the pull-request tick would go on being green, and the new stage would be
 * covered by nobody. Same failure as a stale test count on a screen.
 *
 * So the skip set is NAMED here rather than inferred. Every stage in `gate.mjs`
 * must be either run by the workflow or in `DELIBERATELY_SKIPPED` with a reason
 * beside it. Adding a stage turns this red, which is where the decision gets
 * made instead of being made by omission.
 *
 * ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────────
 * It reads two files as text. It does not run the workflow, cannot tell you the
 * runner has the right Node, and cannot tell you a step passes. A green tick
 * here means the two files still describe the same gate — nothing more.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const GATE = readFileSync(resolve(ROOT, 'scripts/gate.mjs'), 'utf8')
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/gate.yml'), 'utf8')

/** Stage names, read out of `gate.mjs`'s own STAGES array rather than retyped. */
function gateStages() {
  const block = /const STAGES = \[(.*?)\n\]/s.exec(GATE)
  if (!block) throw new Error('could not find STAGES in scripts/gate.mjs')
  return [...block[1].matchAll(/name: '([^']+)'/g)].map((m) => m[1])
}

/**
 * The stages the workflow does not run, each with the reason it does not.
 *
 * Both reasons are load-bearing and neither is "it is slow":
 *
 *  · `turbo-smoke` drives a browser through the real app, and the app has ONE
 *    database, which is production. Every @smoke spec mints a Clerk user and
 *    lets the app create a workspace. On every pull request that would write
 *    test workspaces into the customer database automatically.
 *  · `turbo-build` is already run by Vercel on every pull request, including
 *    `scripts/perf/js-budget.mjs`, which runs inside `next build`.
 */
const DELIBERATELY_SKIPPED = new Map([
  ['turbo-smoke', 'writes to the one production database'],
  ['turbo-build', 'Vercel builds every pull request'],
])

/** How the workflow invokes each stage it does run. */
const RUN_BY_WORKFLOW = new Map([
  ['turbo-typecheck-lint-test', 'pnpm turbo run typecheck lint test --concurrency=1'],
  ['vitest-root', 'pnpm exec vitest run'],
  ['prettier-check', 'pnpm exec prettier --check .'],
])

describe('the CI workflow covers the gate, or says which part it does not', () => {
  it('accounts for every stage the gate defines', () => {
    const stages = gateStages()
    // Five today. Asserted so a stage added WITHOUT touching this file still
    // reaches the check below rather than sliding past an empty loop.
    expect(stages.length).toBeGreaterThanOrEqual(5)

    const unaccounted = stages.filter(
      (name) => !RUN_BY_WORKFLOW.has(name) && !DELIBERATELY_SKIPPED.has(name),
    )
    expect(
      unaccounted,
      'a new gate stage is neither run by .github/workflows/gate.yml nor listed as deliberately skipped',
    ).toEqual([])
  })

  it('names no stage that the gate no longer has', () => {
    const stages = new Set(gateStages())
    const invented = [...RUN_BY_WORKFLOW.keys(), ...DELIBERATELY_SKIPPED.keys()].filter(
      (name) => !stages.has(name),
    )
    // The quieter drift: a stage is renamed or removed, and this file goes on
    // claiming to cover something that does not exist.
    expect(invented, 'this file names a gate stage that scripts/gate.mjs does not define').toEqual(
      [],
    )
  })

  it('actually runs each command it claims to run', () => {
    for (const [stage, command] of RUN_BY_WORKFLOW) {
      expect(WORKFLOW, `${stage} is not invoked by the workflow`).toContain(command)
    }
  })

  it('does not run a stage it declares skipped', () => {
    // The one that would matter: `test:smoke` reaching the job that fires on
    // every pull request. The header prose names it and the dispatch-only job
    // below runs it, so the test is about COMMANDS in the `checks` job, not
    // about the string appearing in the file.
    const checksJob = WORKFLOW.slice(WORKFLOW.indexOf('  checks:'), WORKFLOW.indexOf('  smoke:'))
    const commands = [...checksJob.matchAll(/^\s*run: (.*)$/gm)].map((m) => m[1])
    expect(commands.length, 'the checks job runs nothing').toBeGreaterThan(0)
    for (const [stage] of DELIBERATELY_SKIPPED) {
      const task = stage.replace(/^turbo-/, '')
      for (const command of commands) {
        expect(command, `the checks job runs ${stage}, which it declares skipped`).not.toMatch(
          new RegExp(`turbo run [^&|]*\\b${task}\\b`),
        )
      }
    }
  })

  it('collapses the push and pull_request runs for one branch into one', () => {
    // THIS LINE HAS BEEN WRONG TWICE. First keyed on the head commit, which
    // collapses the pair and silently stops a newer push cancelling an older
    // run. Then `github.head_ref || github.ref`, which reads correctly and is
    // not: on a push `github.ref` is `refs/heads/<branch>` while `head_ref` on a
    // pull request is the bare `<branch>`. Two strings, two groups, nothing
    // collapses — MEASURED as three duplicate push/pull_request pairs running at
    // once across three lanes.
    //
    // `ref_name` is the bare branch name and is the only one of the two that
    // matches `head_ref`. Asserted as an exact expression rather than "contains
    // a branch-ish thing", because the whole defect was two expressions that
    // both name the branch and do not match each other.
    // Comments may sit between `concurrency:` and `group:`; skip them.
    const group = /concurrency:\s*\n(?:\s*#[^\n]*\n)*\s*group: (.+)/.exec(WORKFLOW)?.[1]
    expect(group, 'no concurrency group').toBeDefined()
    // The push/pull_request half is exact, as before. Since 2026-09-05 a
    // dispatched run appends its own run id: MEASURED, two smoke dispatches
    // were cancelled by a teammate's push seconds later because all three
    // events shared one group. The suffix must be EMPTY for push and
    // pull_request (or the pair stops collapsing) and must key on run_id for a
    // dispatch (or a second dispatch cancels the first).
    expect(group.startsWith('gate-${{ github.head_ref || github.ref_name }}')).toBe(true)
    const suffix = group.slice('gate-${{ github.head_ref || github.ref_name }}'.length)
    expect(suffix).toMatch(/workflow_dispatch/)
    expect(suffix).toMatch(/run_id/)
    expect(suffix).toMatch(/\|\| ''/)
    // Named explicitly: `github.ref` carries a `refs/heads/` prefix that
    // `head_ref` does not, so pairing the two can never collapse.
    expect(group).not.toMatch(/github\.ref\s*\}\}/)
    // And not the commit, which turns cancellation off.
    expect(group).not.toContain('sha')
  })

  it('keeps the smoke job behind a typed acknowledgement, never a click', () => {
    // `SAHODA_E2E_ACK_TARGET=1` would be satisfiable by anyone who wanted the
    // error to go away. A defaulted input would be satisfiable by pressing a
    // button. Both are the same hole, and the empty default is what closes it.
    expect(WORKFLOW).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.ack_target != ''",
    )
    expect(WORKFLOW).toContain('SAHODA_E2E_ACK_TARGET: ${{ inputs.ack_target }}')
    expect(WORKFLOW).toMatch(/ack_target:[\s\S]*?default: ''/)
  })

  it('passes every environment variable the smoke task declares', () => {
    // Turborepo 2.x defaults to `envMode: "strict"` and strips anything the task
    // does not declare — the mechanism that once stole `E2E_PORT`. The opposite
    // hole is this one: a variable declared in turbo.json that the workflow
    // never supplies, which fails deep inside the run instead of at the top.
    const turbo = JSON.parse(readFileSync(resolve(ROOT, 'turbo.json'), 'utf8'))
    const declared = turbo.tasks['test:smoke'].env
    // `E2E_PORT` and `E2E_SERVER_CMD` are the two the workflow deliberately
    // leaves to the config's own defaults.
    const supplied = declared.filter((name) => !name.startsWith('E2E_'))
    for (const name of supplied) {
      expect(
        WORKFLOW,
        `${name} is declared on test:smoke but the workflow never sets it`,
      ).toContain(`${name}:`)
    }
  })

  it('the refusal guard checks every secret the run step forwards', () => {
    /**
     * ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────
     * The guard step refused on THREE names while the run step below it
     * forwarded SIX. Two of the missing three are in `cloud-setup.sh`'s
     * ENV_REQUIRED, so somebody who added exactly the three the guard asked for
     * CLEARED IT and then died inside the suite with the opaque failure the
     * guard exists to prevent. A guard that certifies a configuration it never
     * checked is worse than no guard: it says the environment is ready.
     *
     * The test directly above -- "passes every environment variable the smoke
     * task declares" -- could NOT see this, and that is the point of adding a
     * second one. It asserts the workflow mentions each name somewhere, and the
     * run step mentions all six, so it was green throughout. Presence in the
     * FILE is not presence in the GUARD.
     */
    const turbo = JSON.parse(readFileSync(resolve(ROOT, 'turbo.json'), 'utf8'))
    const declared = turbo.tasks['test:smoke'].env.filter(
      (name) => !name.startsWith('E2E_') && name !== 'SAHODA_E2E_ACK_TARGET',
    )
    expect(declared.length).toBe(6)

    // The guard's list, read out of its own NEEDED block rather than retyped --
    // a retyped copy is a third list that can drift from the other two.
    const block = /NEEDED="([^"]+)"/.exec(WORKFLOW)
    expect(block, 'could not find the NEEDED list in the refusal guard').not.toBeNull()
    // Each line is ENV=SECRET since 2026-09-05: the four Supabase values are read
    // from E2E_-prefixed secrets that name STAGING, because the unprefixed names
    // are production and three nightly workflows write real customers' metrics
    // through them. MEASURED, run 33961015055: with the six unprefixed secrets
    // set, the guard passed and the suite refused `refused-production` in 9s.
    const pairs = block[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => {
        const [env, secret] = line.split('=')
        expect(secret, `${line} is not an ENV=SECRET pair`).toBeDefined()
        return { env, secret }
      })
    const checked = pairs.map((p) => p.env)

    expect([...checked].sort()).toEqual([...declared].sort())

    // And each one must be wired to BOTH namespaces, or the "wrong tab" half of
    // the message silently stops reporting for that name -- and wired to the
    // SAME secret the run step forwards, or the guard certifies one value while
    // the suite runs on another.
    for (const { env, secret } of pairs) {
      expect(WORKFLOW, `${env} has no SECRET_ binding in the guard`).toContain(
        `SECRET_${env}: \${{ secrets.${secret} }}`,
      )
      expect(WORKFLOW, `${env} has no VAR_ binding in the guard`).toContain(
        `VAR_${env}: \${{ vars.${secret} }}`,
      )
      // Anchored at a line start: a bare `toContain` here was green under
      // mutation, because `SECRET_SUPABASE_DB_URL: ...` in the guard block
      // CONTAINS `SUPABASE_DB_URL: ...`. MEASURED 2026-09-05, first draft.
      const escaped = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(WORKFLOW, `the run step does not forward ${secret} as ${env}`).toMatch(
        new RegExp(`\\n\\s+${escaped(env)}: ${escaped(`\${{ secrets.${secret} }}`)}`),
      )
    }

    // The four Supabase values must NOT be the production names: the nightly
    // workflows read those, and the suite refuses production by design.
    for (const { env, secret } of pairs) {
      if (env.includes('SUPABASE'))
        expect(secret, `${env} reads a production secret`).toMatch(/^E2E_/)
    }
  })
})
