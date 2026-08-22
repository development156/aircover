#!/usr/bin/env node
/** Who actually exists in production — needed to pick two real, distinct tenants. */
import { q } from '../lib/db.mjs'

const ws = await q(`
  select w.id, w.name, w.slug, w.created_at,
         (select count(*)::int from workspace_members m where m.workspace_id=w.id) as members,
         (select count(*)::int from competitor_subscriptions s where s.workspace_id=w.id) as subs,
         (select count(*)::int from posts p where p.workspace_id=w.id) as posts,
         (select coalesce(balance_total,0) from credit_balances b where b.workspace_id=w.id) as credits
  from workspaces w order by w.created_at
`)
console.log('=== WORKSPACES ===')
for (const r of ws)
  console.log(
    `${r.id}  members=${r.members} subs=${r.subs} posts=${r.posts} credits=${r.credits}  ${r.slug ?? ''} ${r.name}`,
  )

const mem = await q(`
  select workspace_id, user_id, role from workspace_members order by workspace_id, user_id
`)
console.log('\n=== MEMBERS ===')
for (const r of mem) console.log(`${r.workspace_id}  ${r.user_id}  ${r.role}`)

console.log('\n=== COMPETITORS (shared rows) ===')
const comp = await q(`
  select c.id, c.name, c.domain,
         (select count(*)::int from competitor_subscriptions s where s.competitor_id=c.id) as subscribers,
         (select array_agg(distinct s.workspace_id::text) from competitor_subscriptions s where s.competitor_id=c.id) as by_ws,
         (select count(*)::int from competitor_sources cs where cs.competitor_id=c.id) as sources
  from competitors c order by subscribers desc, c.name
`)
for (const r of comp)
  console.log(
    `${r.id}  subs=${r.subscribers} sources=${r.sources}  ${r.name} (${r.domain})  ws=${(r.by_ws || []).join(',')}`,
  )

console.log('\n=== ROW COUNTS, tenant tables with >0 ===')
const tabs = await q(`
  select c.relname as t from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by 1
`)
for (const { t } of tabs) {
  const [{ n }] = await q(`select count(*)::int as n from public."${t}"`)
  if (n > 0) console.log(String(n).padStart(6), t)
}
