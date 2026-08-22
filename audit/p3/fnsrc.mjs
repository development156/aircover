#!/usr/bin/env node
/** Print the body of the RPCs that matter most, from the SERVER not the tree. */
import { q } from '../lib/db.mjs'

const names = process.argv.slice(2)
for (const n of names) {
  const rows = await q(
    `select pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
     where nn.nspname='public' and p.proname=$1`,
    [n],
  )
  console.log(`\n========================= ${n} =========================`)
  for (const r of rows) console.log(r.def)
  if (!rows.length) console.log('(not found in public)')
}
