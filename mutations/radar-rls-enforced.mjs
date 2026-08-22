/**
 * IS THE RADAR RLS SUITE ACTUALLY ENFORCING ANYTHING?
 *
 * `radar_rls.pglite.test.ts` passed 11/11 on its first run, which is exactly the
 * shape a vacuous suite has. Radar's registry is SHARED between customers and its
 * policies are hand-written rather than the one-line house helper, so "the tests
 * are green" is worth nothing until each policy has been broken and seen to be
 * noticed.
 *
 * Two DIFFERENT disclosures have to be prevented, and the mutants are grouped
 * that way on purpose:
 *
 *   (a) reading a competitor you do not subscribe to;
 *   (b) seeing WHO ELSE is watching a competitor you do subscribe to.
 *
 * Mutant 5 is the one this whole spec exists for. It widens the subscription
 * policy to "subscriptions to competitors I also subscribe to" — which is a
 * mistake a careful person could make while trying to be helpful, which leaves
 * disclosure (a) perfectly intact, and which hands a bakery the fact that its
 * rival is tracking it. If that mutant survived, this feature would be unsafe to
 * ship no matter how green the suite looked.
 *
 * NOTHING HERE EDITS A MIGRATION. Every mutant lands in the test helper, so a
 * crashed run can never leave `packages/db/supabase/migrations` modified.
 */
const RUN = 'pnpm --filter @sahoda/db exec vitest run tests/radar_rls.pglite.test.ts'

/** Where a `drop policy` / `create policy` mutant is spliced into the boot. */
const ANCHOR = '  await db.exec(SUPABASE_GRANTS)\n  return db'
const after = (sql) =>
  `  await db.exec(SUPABASE_GRANTS)\n  await db.exec(\`${sql}\`) // MUTANT\n  return db`

const HELPER = 'packages/db/tests/helpers/pglite-tenant.ts'

export default {
  cwd: '.',
  command: RUN,
  mutants: [
    {
      // The whole suite rests on this one line. If the role does not drop, every
      // policy below is inert and all eleven tests pass against no security at all.
      name: 'the role never drops — every Radar policy is inert',
      file: HELPER,
      find: '    await db.exec(`set local role ${role}`)',
      replace: '    void role // MUTANT: stay superuser',
    },
    {
      name: 'no GRANTs — every read denied, which looks exactly like perfect isolation',
      file: HELPER,
      find: ANCHOR,
      replace: '  void SUPABASE_GRANTS // MUTANT: no table privileges at all\n  return db',
    },

    // ── disclosure (a): the registry itself ───────────────────────────────────
    {
      name: '(a) competitors readable by every signed-in user',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'drop policy t_select on competitors;' +
          ' create policy t_select on competitors for select to authenticated using (true);',
      ),
    },
    {
      name: '(a) competitor_sources readable by every signed-in user',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'drop policy t_select on competitor_sources;' +
          ' create policy t_select on competitor_sources for select to authenticated using (true);',
      ),
    },

    // ── disclosure (b): who is watching whom ─────────────────────────────────
    {
      // THE MUTANT THIS SPEC EXISTS FOR. Not "readable by everyone" — that is the
      // easy one. This is the policy a well-meaning author writes when they think
      // "they already share this competitor, so this row is fine to show", and it
      // is precisely the disclosure that cannot be taken back.
      name: '(b) subscriptions visible for any competitor I also subscribe to',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'drop policy t_select on competitor_subscriptions;' +
          ' create policy t_select on competitor_subscriptions for select to authenticated' +
          ' using (exists (select 1 from competitor_subscriptions mine' +
          '   where mine.competitor_id = competitor_subscriptions.competitor_id' +
          '     and mine.workspace_id in (select app.member_workspace_ids())));',
      ),
    },
    {
      name: '(b) the fetch log becomes readable — subscriber_count leaks the registry',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'create policy t_select on radar_fetch_log for select to authenticated using (true);',
      ),
    },

    // ── the derived tables, which are a second copy of the same secret ────────
    {
      name: '(a) snapshots readable by every signed-in user',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'drop policy t_select on competitor_snapshots;' +
          ' create policy t_select on competitor_snapshots for select to authenticated using (true);',
      ),
    },
    {
      name: '(a) changes readable by every signed-in user',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'drop policy t_select on competitor_changes;' +
          ' create policy t_select on competitor_changes for select to authenticated using (true);',
      ),
    },

    // ── the writing door, which answers the same question ────────────────────
    {
      // A customer able to INSERT learns whether a rival is already tracked from
      // the difference between success and a duplicate-key error. The suite must
      // notice the permission arriving, not merely that "something was refused".
      name: 'members may insert into the shared registry — existence probing by write',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'create policy m_insert on competitors for insert to authenticated with check (true);' +
          ' create policy m_insert on competitor_sources for insert to authenticated with check (true);',
      ),
    },
    {
      // SURVIVED on the first run of this spec, and the survival was the finding.
      // The test only tried `delete … returning id`, and Postgres applies SELECT
      // policies to a DELETE *only when there is a RETURNING clause* — so a
      // correct SELECT policy was standing in for a wide-open DELETE policy and
      // the suite could not tell them apart. The form an attacker writes has no
      // RETURNING. Killed once the test checked `affectedRows` on that form.
      name: 'a member may delete ANY subscription, including another workspace’s',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'drop policy t_delete on competitor_subscriptions;' +
          ' create policy t_delete on competitor_subscriptions for delete to authenticated using (true);',
      ),
    },
    {
      // The sibling of the mutant above. Fixing only the shape a failing mutant
      // names is how this repository has shipped the same defect twice; UPDATE
      // has the identical RETURNING blind spot, so it gets its own mutant.
      name: 'a member may relabel ANY subscription, including another workspace’s',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'drop policy t_update on competitor_subscriptions;' +
          ' create policy t_update on competitor_subscriptions for update to authenticated' +
          ' using (true) with check (true);',
      ),
    },

    // ── the dedupe, which is the reason the registry is shared at all ─────────
    {
      // If the normaliser stops normalising, "@sharedrival" and
      // "instagram.com/SharedRival/" become two rows. Nothing is INSECURE — but
      // the shared row the (b) tests depend on stops existing, and the feature
      // silently costs double. A suite that did not notice would be proving
      // isolation on a fixture that no longer contains the interesting case.
      name: 'the normaliser stops normalising — the shared competitor becomes two rows',
      file: HELPER,
      find: ANCHOR,
      replace: after(
        'create or replace function app.radar_normalize_locator(p_kind text, p_raw text)' +
          ' returns text language sql immutable as $m$ select p_raw $m$;',
      ),
    },
  ],
}
