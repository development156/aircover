-- ─────────────────────────────────────────────────────────────────────────────
-- Capture the RLS auto-enable event trigger that was applied OUT OF BAND.
--
-- Found 2026-08-01 by replaying the 23-migration history onto an empty staging
-- database and diffing it against production: identical on tables (38), columns
-- (390), constraints (143), policies (63), triggers (36) and indexes (114) — and
-- production had ONE extra public function.
--
-- That function is this one. It exists on production, in no migration, so anyone
-- rebuilding the schema from its history — disaster recovery, a new environment,
-- staging — got a database MISSING a safety net that production has. The schema
-- and its history had quietly diverged, and only building a second database from
-- the history could show it: until today they were the same object, never compared.
--
-- WHAT IT DOES. On every `CREATE TABLE` in `public`, it enables row level security
-- on the new table automatically. It is a backstop for the house rule in
-- packages/db/CLAUDE.md — "every table: RLS enabled + policies in the same
-- migration" — catching the case where someone writes the table and forgets.
--
-- It is a BACKSTOP, not a substitute: RLS enabled with zero policies denies
-- everything to authenticated/anon, which is safe but not useful. The migration
-- that creates a table still owes it policies.
--
-- WHY IT SHIPS BEFORE THE SLICE B MIGRATIONS. Slice B creates `zernio_profiles`.
-- With this trigger in place that table gets RLS at creation as well as from its
-- own `alter table ... enable row level security` — belt and braces, and it means
-- the very next table anyone adds is covered whether or not they remember.
--
-- TRANSCRIBED FROM THE LIVE DEFINITION, not written from memory:
--   select pg_get_functiondef(oid) from pg_proc … where proname = 'rls_auto_enable';
--   select evtname, evtevent, evttags, evtfoid from pg_event_trigger where evtname = 'ensure_rls';
-- Production reports: event `ddl_command_end`, tags {CREATE TABLE, CREATE TABLE AS,
-- SELECT INTO}, owner postgres, enabled 'O'.
--
-- IDEMPOTENT so it can be applied to production later without drift: `create or
-- replace` for the function, drop-then-create for the trigger (event triggers have
-- no `create or replace`).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

drop event trigger if exists ensure_rls;

create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

comment on function public.rls_auto_enable() is
  'Backstop for the every-table-has-RLS rule: enables row level security on any '
  'table created in public. Applied out of band before 2026-08-01 and captured '
  'into a migration on that date, after a staging replay showed production and '
  'its migration history had diverged by exactly this function.';
