#!/usr/bin/env node
/**
 * Migrate brand_memory payloads v1 → v2 (audiences[], field kinds, red_lines).
 *
 * NOT RUN. Written and left unrun deliberately — see the guard below.
 *
 * doc 18 §15: "Staging for migrations. Never production ref rloztdhzfliyvpvxsgjl."
 * This worktree's .env points at exactly that ref, so there is no valid target
 * here. Staging (yoxmzwkxweasfaahhvpj) exists but this worktree holds no
 * credentials for it, and per docs/audit/2026-07-30-staging-project-plan.md it
 * deliberately carries NO customer data — so it has no brains to migrate either.
 *
 * DRY RUN BY DEFAULT. `--apply` is required to write anything, and the
 * production guard cannot be overridden by a flag: a planning-time "yes" is not
 * command-time consent.
 *
 *   node --env-file=.env scripts/migrate-brains-v2.mjs            # dry run
 *   node --env-file=.env scripts/migrate-brains-v2.mjs --apply    # writes
 */
const FORBIDDEN_REF = 'rloztdhzfliyvpvxsgjl'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const apply = process.argv.includes('--apply')

if (!url || !key) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const ref = (url.match(/https:\/\/([a-z0-9]+)\.supabase/) ?? [])[1] ?? '(unknown)'
if (ref === FORBIDDEN_REF) {
  console.error(`REFUSING: ${ref} is production (doc 18 §15). Point at staging and re-run.`)
  console.error('There is no --force. The guard is the point.')
  process.exit(2)
}

const base = new URL(url).origin
const h = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }

const rows = await (
  await fetch(`${base}/rest/v1/brand_memory?select=id,workspace_id,version,status,payload`, {
    headers: h,
  })
).json()

let already = 0
let planned = 0
const changes = []
for (const row of rows) {
  if (row.payload?.version === 2) {
    already += 1
    continue
  }
  // The transform is imported at runtime rather than reimplemented here, so the
  // script and the tested function can never drift.
  const { migrateBrandMemoryV1ToV2 } = await import('../packages/shared/src/brand/migrate-v2.ts')
  try {
    const next = migrateBrandMemoryV1ToV2(row.payload)
    planned += 1
    changes.push({ id: row.id, workspace_id: row.workspace_id, next })
  } catch (e) {
    console.error(`SKIP ${row.id}: payload does not satisfy v1 — ${e.message}`)
  }
}

console.log(`target=${ref} rows=${rows.length} already_v2=${already} to_migrate=${planned}`)
if (!apply) {
  console.log('DRY RUN — nothing written. Re-run with --apply against staging.')
  process.exit(0)
}

// NOTE: brand_memory is member-read / server-write. A real apply goes through a
// wt-db-owned function, not a direct PATCH — see the dependency note in the
// report. This branch is deliberately left unimplemented rather than guessed.
console.error('APPLY path not implemented: needs a wt-db write function (see report).')
process.exit(3)
