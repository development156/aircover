/**
 * PROD vs THE MIGRATION SET. "The branch is not the schema" — other lanes apply
 * to the same database, and some of production predates the migration set
 * entirely.
 */
import { q } from '../lib/db.mjs'
const prod = await q(`select c.relname,
    c.relrowsecurity as rls,
    (select count(*) from pg_policy p where p.polrelid=c.oid)::int as policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by 1`)

const branchOnly = process.argv.slice(2) // table names produced by the branch, passed in
const prodNames = new Set(prod.map((r) => r.relname))
console.log('prod public tables:', prod.length)
if (branchOnly.length) {
  const branch = new Set(branchOnly)
  console.log('\nIN PROD, NOT PRODUCED BY THE BRANCH:')
  for (const r of prod)
    if (!branch.has(r.relname))
      console.log(`  ${r.relname.padEnd(28)} rls=${r.rls} policies=${r.policies}`)
  console.log('\nPRODUCED BY THE BRANCH, ABSENT FROM PROD:')
  for (const t of branchOnly) if (!prodNames.has(t)) console.log(`  ${t}`)
}
console.log(
  '\nclerk_id_map in prod:',
  JSON.stringify(prod.find((r) => r.relname === 'clerk_id_map') ?? null),
)
