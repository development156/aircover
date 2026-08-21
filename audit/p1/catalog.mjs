#!/usr/bin/env node
/**
 * P1 step 0 — the catalog, from the SERVER, never from a list in this file.
 * Read-only. Prints the server's own answers so every later claim is anchored.
 */
import { q } from '../lib/db.mjs'

const out = {}

out.serverVersion = await q(`select version() as v, current_database() as db, now() as at`)

out.migrations = await q(`
  select count(*)::int as applied, max(version) as latest
  from supabase_migrations.schema_migrations
`)

// Every base table in public, with RLS state and whether it carries workspace_id.
out.tables = await q(`
  select c.relname                       as table_name,
         c.relrowsecurity                as rls_enabled,
         c.relforcerowsecurity           as rls_forced,
         exists (
           select 1 from information_schema.columns col
           where col.table_schema='public' and col.table_name=c.relname
             and col.column_name='workspace_id'
         )                               as has_workspace_id,
         (select count(*)::int from pg_policies p
           where p.schemaname='public' and p.tablename=c.relname) as policy_count
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
  order by c.relname
`)

out.views = await q(`
  select c.relname as view_name,
         c.relkind as kind,
         coalesce(
           (select option_value from pg_options_to_table(c.reloptions)
             where option_name='security_invoker'), 'NOT SET') as security_invoker,
         coalesce(
           (select option_value from pg_options_to_table(c.reloptions)
             where option_name='security_barrier'), 'NOT SET') as security_barrier,
         pg_get_userbyid(c.relowner) as owner
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('v','m')
  order by c.relname
`)

out.policies = await q(`
  select tablename, policyname, cmd, roles::text, qual, with_check
  from pg_policies where schemaname='public'
  order by tablename, policyname
`)

// Functions reachable from PostgREST (public schema = RPC surface).
out.publicFunctions = await q(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         case p.prosecdef when true then 'DEFINER' else 'INVOKER' end as security,
         array(select r.rolname from pg_roles r
               where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
                 and r.rolname in ('anon','authenticated','service_role')) as grantees
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
  order by p.proname
`)

// Table-level grants to anon — a grant is what makes RLS the only thing left.
out.anonGrants = await q(`
  select table_name, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'
  group by table_name order by table_name
`)

console.log(JSON.stringify(out, null, 2))
