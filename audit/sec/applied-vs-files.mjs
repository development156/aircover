import fs from 'node:fs'
import path from 'node:path'
import { q } from '../lib/db.mjs'
import { WT } from '../lib/env.mjs'
const dir = path.join(WT, 'packages/db/supabase/migrations')
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.split('_')[0])
const applied = new Set(
  (await q(`select version from supabase_migrations.schema_migrations`)).map((r) => r.version),
)
console.log('migration files on this branch:', files.length, ' applied rows in prod:', applied.size)
const missing = files.filter((v) => !applied.has(v))
console.log('\nON THE BRANCH, NOT RECORDED AS APPLIED IN PROD:')
for (const v of missing) console.log('  ' + fs.readdirSync(dir).find((f) => f.startsWith(v)))
const extra = [...applied].filter((v) => !files.includes(v))
console.log('\nRECORDED AS APPLIED IN PROD, NO FILE ON THIS BRANCH:')
for (const v of extra.sort()) console.log('  ' + v)
