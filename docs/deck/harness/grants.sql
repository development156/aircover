-- The privileges a real Supabase project grants at CREATION, before any migration
-- runs. pgbox's preamble creates the roles but not these, so `authenticated` had
-- SELECT on nothing and every PostgREST read would have returned 401/permission
-- denied — which looks exactly like an RLS denial and would have been misread as
-- a seeding bug.
--
-- This does NOT weaken the security boundary: every tenant table has RLS enabled
-- with policies written `to authenticated`, so these grants only make the role
-- eligible to be filtered by those policies. That is precisely Supabase's model.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- PostgREST connects as `postgres` and SET ROLEs to the claim's role.
grant anon, authenticated, service_role to postgres;
