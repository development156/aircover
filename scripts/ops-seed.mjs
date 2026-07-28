#!/usr/bin/env node
import { loadEnv, warn } from './lib/ops-env.mjs'
import {
  hasDbCredentials,
  upsert,
  select,
  insert,
  patch,
  clerkUserIdForEmail,
} from './lib/ops-rest.mjs'
import { roadmapItems, tasks } from './lib/ops-seed-data.mjs'

/**
 * Seed the /admin platform tables (doc 13 §18, P0).
 *
 * Idempotent: roadmap items and tasks upsert on their unique `code`, so running
 * this twice changes nothing. Owner seats are matched on lower(email) — a
 * functional unique index, which PostgREST cannot name as an on_conflict target,
 * so those go select-then-write.
 *
 * Dependency-free by design: `fetch` is global from Node 18, and a seed that
 * needs its own install step is a seed nobody runs.
 *
 * What it deliberately does NOT do: grant credits, create workspaces, or touch
 * anything outside ops_*. Seeding is not an admin action.
 */

async function seedOwners(emails) {
  if (emails.length === 0) {
    warn('ADMIN_BOOTSTRAP_EMAILS is empty — no owner seats seeded. /admin will 404 for everyone.')
    return { created: 0, linked: 0, existing: 0 }
  }

  let created = 0
  let linked = 0
  let existing = 0

  for (const email of emails) {
    const found = await select(
      'ops_admins',
      `select=id,user_id,role,status&email=ilike.${encodeURIComponent(email)}&limit=1`,
    )
    const clerkUserId = await clerkUserIdForEmail(email)

    if (found.length === 0) {
      await insert('ops_admins', [
        {
          email,
          user_id: clerkUserId,
          name: null,
          role: 'owner',
          status: 'active',
        },
      ])
      created += 1
      console.log(
        `  + owner ${email}${clerkUserId ? ' (linked to Clerk)' : ' (unlinked — the user.created webhook will link it)'}`,
      )
      continue
    }

    existing += 1
    const row = found[0]
    // Only ever ADD a link. Never re-point an existing user_id from a seed: that
    // is how a console changes hands by accident.
    if (!row.user_id && clerkUserId) {
      await patch('ops_admins', `id=eq.${row.id}`, { user_id: clerkUserId })
      linked += 1
      console.log(`  ~ owner ${email} linked to Clerk`)
    } else {
      console.log(`  = owner ${email} already seated (${row.role}/${row.status})`)
    }
  }

  return { created, linked, existing }
}

async function main() {
  const env = loadEnv()

  console.log('→ Seeding /admin platform tables')

  if (!hasDbCredentials()) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or the Supabase service key — nothing was written.',
    )
    process.exit(1)
  }

  console.log(`  project ${env.supabaseUrl}`)

  console.log('→ Owner seats from ADMIN_BOOTSTRAP_EMAILS')
  const owners = await seedOwners(env.bootstrapEmails)

  console.log('→ Roadmap items from docs/05 + doc 13 §18')
  const items = roadmapItems()
  await upsert('ops_roadmap_items', items, 'code')
  const stages = new Set(items.map((i) => i.stage))
  console.log(`  ${items.length} items across ${stages.size} stages (all Alpha items left at todo)`)

  console.log('→ Board tasks for this build')
  const board = tasks()
  // `merge-duplicates` would reset a card that has since moved to done, so the
  // seed writes the identity columns only and leaves lifecycle alone on re-run.
  const existingCodes = new Set(
    (await select('ops_tasks', 'select=code&limit=2000')).map((r) => r.code),
  )
  const fresh = board.filter((t) => !existingCodes.has(t.code))
  await insert('ops_tasks', fresh)
  console.log(`  ${fresh.length} new, ${board.length - fresh.length} already on the board`)

  console.log('')
  console.log(
    `Done. owners: ${owners.created} created / ${owners.linked} linked / ${owners.existing} existing.`,
  )
  if (!env.ingestToken) {
    warn('DEVOPS_INGEST_TOKEN is not set (or is still a placeholder) — hook sync will no-op.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
