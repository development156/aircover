#!/usr/bin/env node
/** Bodies of the `app` schema helpers that carry the authorization decisions. */
import { q } from '../lib/db.mjs'

for (const n of process.argv.slice(2)) {
  const rows = await q(
    `select pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
     where nn.nspname='app' and p.proname=$1`,
    [n],
  )
  console.log(`\n===== app.${n} =====`)
  for (const r of rows) console.log(r.def)
  if (!rows.length) console.log('(not found in app schema)')
}
