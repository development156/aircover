#!/usr/bin/env node
/**
 * ARM THE SCHEDULED JOBS — sync `.github/workflows` onto the Actions repository's
 * DEFAULT branch, which is the only place GitHub will fire a `schedule` from.
 *
 * ── THE PROBLEM THIS REPLACES ────────────────────────────────────────────────
 * GitHub fires `schedule` and offers `workflow_dispatch` only for workflow files
 * that exist on a repository's DEFAULT branch. Every nightly job in this repo was
 * written on the lane that built it, so none of them were armed. MEASURED
 * 2026-08-23: of five workflow files, GitHub knew about ONE per repository.
 *
 * The first job to hit this was solved by hand — an orphan commit carrying that
 * one file onto the default branch, with a repository variable pointing at the
 * branch that held the code. It worked. But it is a per-job ritual: three more
 * jobs shipped afterwards and none of them got it, so none of them ever ran.
 *
 * This script is that ritual done once, for all of them, repeatably. Adding a
 * nightly job is now: write the workflow on your lane, run this, done.
 *
 * ── WHY THE ACTIONS REPO IS NOT THE DEPLOY REPO ──────────────────────────────
 * There are two remotes and they are not interchangeable:
 *
 *   development156/sahodalabs  default `wt-web`   — Vercel builds from it.
 *                                                   MEASURED: ZERO Actions
 *                                                   secrets. A job armed here
 *                                                   has no database to write to.
 *   IDIVASM/sahodalabs         default `main`     — carries SUPABASE_DB_URL,
 *                                                   SUPABASE_SERVICE_ROLE_KEY,
 *                                                   NEXT_PUBLIC_SUPABASE_URL and
 *                                                   ZERNIO_API_KEY. This is where
 *                                                   the one working job runs.
 *
 * So the jobs are armed on IDIVASM. Moving them would mean copying production
 * service-role credentials into a second GitHub repository, which is a decision
 * for the founder and not a side effect of a script.
 *
 * ── THE DEFAULT BRANCH DOES NOT HOLD THE CODE, AND THAT IS FINE ──────────────
 * `main` on the Actions repo is a July snapshot that shares no history with the
 * working lineage. It is a CARRIER for the schedule, nothing else. Each workflow
 * checks out `vars.SAHODA_JOBS_REF` — ONE variable for all four jobs, rather than
 * the four separate ones that had drifted onto three different dead lanes — and
 * every run prints the commit it actually resolved into its run summary. That is
 * the answer to "which branch's code did last night's run execute?", and it is
 * printed by the run itself rather than reconstructed afterwards.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────────
 * Dry run unless `--apply`. Never deletes: a workflow on the default branch that
 * is absent locally is REPORTED and left alone, because deleting it would silently
 * disarm a job, which is the failure this whole file exists to end.
 *
 * Usage:
 *   node scripts/ci/arm-workflows.mjs             # what would change
 *   node scripts/ci/arm-workflows.mjs --apply     # change it
 *   node scripts/ci/arm-workflows.mjs --repo O/R  # somewhere else
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const WORKFLOW_DIR = join(REPO_ROOT, '.github/workflows')

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const REPO = valueOf('--repo') ?? 'IDIVASM/sahodalabs'

function valueOf(flag) {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

function gh(args, { allowFail = false } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    if (allowFail) return null
    throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${error.stderr || error.message}`)
  }
}

/** Git's own blob id, so "same" means the same thing here as it does to git. */
function blobSha(buffer) {
  return createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex')
}

/**
 * The `on:` block of every workflow, parsed by a real YAML parser.
 *
 * A regex would be a spelling match — `on:` is YAML 1.1, where the bare word
 * parses as the BOOLEAN true, quoting styles differ, and `schedule` can appear
 * inside a comment. This lane is fixing four guards that grep where they claim to
 * parse; it is not going to add a fifth. If python3 with PyYAML is not here, this
 * FAILS rather than falling back to a guess.
 */
function readTriggers(files) {
  const script = [
    'import yaml,json,sys',
    'out={}',
    'for f in sys.argv[1:]:',
    '    d=yaml.safe_load(open(f))',
    // YAML 1.1 turns the key `on` into the boolean True. GitHub means the string.
    '    t=d.get("on", d.get(True))',
    '    out[f.rsplit("/",1)[-1]]=sorted(t) if isinstance(t,dict) else [str(t)]',
    'print(json.dumps(out))',
  ].join('\n')
  try {
    const out = execFileSync('python3', ['-c', script, ...files.map((f) => join(WORKFLOW_DIR, f))], {
      encoding: 'utf8',
    })
    return JSON.parse(out)
  } catch (error) {
    throw new Error(
      'Cannot parse the workflow triggers: python3 with PyYAML is required.\n' +
        'Refusing to guess which files are schedule-driven.\n' +
        (error.stderr || error.message),
    )
  }
}

function main() {
  const meta = JSON.parse(gh(['api', `repos/${REPO}`, '--jq', '{d:.default_branch,p:.permissions}']))
  const branch = meta.d
  console.log(`Actions repository : ${REPO}`)
  console.log(`Default branch     : ${branch}   (the only ref GitHub schedules from)`)

  const secrets = JSON.parse(gh(['api', `repos/${REPO}/actions/secrets`, '--jq', '[.secrets[].name]']))
  console.log(`Secrets present    : ${secrets.length ? secrets.join(', ') : '(none — jobs here cannot reach the database)'}`)

  const everything = readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()

  // ── WHICH FILES ACTUALLY NEED ARMING ──────────────────────────────────────
  // Only a `schedule` trigger is default-branch-bound. `deployment_status`,
  // `push` and `pull_request` fire from the branch that carries the file, and
  // MEASURED 2026-08-23 the post-deploy smoke has been firing that way from
  // `wt-sec`, `wt-loop` and `wt-handoff` — arming it here would put a second
  // copy on a repository Vercel never posts a deployment to.
  //
  // Derived from each file rather than listed, so a new nightly job is armed
  // without editing this script. The cost of deriving is that a job which LOSES
  // its schedule silently leaves the set — so the skipped files are PRINTED with
  // the triggers they do have, and a job that quietly stopped being scheduled is
  // visible in that list rather than absent from both.
  const triggers = readTriggers(everything)
  const local = everything.filter((f) => triggers[f].includes('schedule'))
  const skipped = everything.filter((f) => !triggers[f].includes('schedule'))

  // What the default branch holds today, by path -> {sha, blob}.
  const remote = new Map()
  const listing = gh(
    ['api', `repos/${REPO}/contents/.github/workflows?ref=${branch}`, '--jq', '.[] | "\\(.name)\\t\\(.sha)"'],
    { allowFail: true },
  )
  if (listing) {
    for (const line of listing.trim().split('\n').filter(Boolean)) {
      const [name, sha] = line.split('\t')
      remote.set(name, sha)
    }
  }

  const plan = []
  for (const name of local) {
    const bytes = readFileSync(join(WORKFLOW_DIR, name))
    const mine = blobSha(bytes)
    const theirs = remote.get(name)
    if (theirs === mine) plan.push({ name, action: 'same', bytes })
    else if (theirs) plan.push({ name, action: 'update', bytes, sha: theirs })
    else plan.push({ name, action: 'create', bytes })
  }

  console.log('')
  for (const item of plan) {
    const mark = { same: '  =', create: '  +', update: '  ~' }[item.action]
    console.log(`${mark} ${item.name}`)
  }
  // Never deleted, only named. Removing one here would disarm a job silently.
  for (const name of remote.keys()) {
    if (!local.includes(name)) console.log(`  ! ${name}  — on ${branch} but not here; left alone, decide by hand`)
  }
  for (const name of skipped) {
    console.log(`  · ${name}  — no schedule (${triggers[name].join(', ')}); fires from its own branch, not armed here`)
  }

  const todo = plan.filter((p) => p.action !== 'same')
  if (todo.length === 0) {
    console.log(`\nNothing to do — ${branch} already carries every workflow byte-for-byte.`)
  } else if (!APPLY) {
    console.log(`\n${todo.length} file(s) would change. Re-run with --apply.`)
    return
  } else {
    for (const item of todo) {
      const args = [
        'api', '--method', 'PUT', `repos/${REPO}/contents/.github/workflows/${item.name}`,
        '-f', `message=ci: arm ${item.name} on ${branch} (scripts/ci/arm-workflows.mjs)`,
        '-f', `branch=${branch}`,
        '-f', `content=${item.bytes.toString('base64')}`,
      ]
      if (item.sha) args.push('-f', `sha=${item.sha}`)
      gh(args)
      console.log(`  wrote ${item.name}`)
    }
  }

  // ── THE ONLY CHECK THAT MATTERS: does GitHub now KNOW about them? ──────────
  // A file on the default branch is necessary but the registration is what makes
  // a job dispatchable, and it is what an earlier session would have caught.
  const known = JSON.parse(
    gh(['api', `repos/${REPO}/actions/workflows`, '--jq', '[.workflows[] | {path,state}]']),
  )
  console.log('\nGitHub now knows about:')
  for (const name of local) {
    const hit = known.find((w) => w.path === `.github/workflows/${name}`)
    console.log(`  ${hit ? `armed (${hit.state})` : 'NOT REGISTERED'.padEnd(13)}  ${name}`)
  }
  const missing = local.filter((n) => !known.some((w) => w.path === `.github/workflows/${n}`))
  if (missing.length && APPLY) {
    console.log('\nRegistration can lag a push by a few seconds. Re-run to re-check.')
  }
}

main()
