#!/usr/bin/env node
import { withClient } from '../lib/db.mjs'

const T = [
  'workspaces',
  'workspace_members',
  'competitors',
  'competitor_sources',
  'competitor_subscriptions',
  'competitor_snapshots',
  'competitor_changes',
  'radar_limits',
  'radar_fetch_log',
]
await withClient(async (c) => {
  for (const t of T) {
    const cols = (
      await c.query(
        `select column_name, data_type, is_nullable, column_default
         from information_schema.columns
         where table_schema='public' and table_name=$1 order by ordinal_position`,
        [t],
      )
    ).rows
    console.log(`\n== ${t} ==`)
    for (const c2 of cols)
      console.log(
        `   ${c2.column_name.padEnd(24)} ${c2.data_type.padEnd(28)} ${c2.is_nullable === 'NO' ? 'NOT NULL' : ''} ${c2.column_default ?? ''}`,
      )
    const cons = (
      await c.query(
        `select conname, pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid = ('public.'||$1)::regclass order by contype`,
        [t],
      )
    ).rows
    for (const k of cons) console.log(`   ~ ${k.conname}: ${k.def}`)
    const pol = (
      await c.query(
        `select policyname, cmd, roles::text as roles from pg_policies
         where schemaname='public' and tablename=$1`,
        [t],
      )
    ).rows
    console.log(`   policies: ${pol.map((p) => `${p.policyname}/${p.cmd}`).join(' ') || '(none)'}`)
  }
})
