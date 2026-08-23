import { q } from '../lib/db.mjs'
const r = await q(
  `select version from supabase_migrations.schema_migrations order by version desc limit 8`,
)
console.log(r.map((x) => x.version).join('\n'))
console.log(
  'total applied:',
  (await q(`select count(*)::int n from supabase_migrations.schema_migrations`))[0].n,
)
