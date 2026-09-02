/**
 * THE RULE: a variant is published at most once, and never stranded.
 *
 * Both halves live in ONE predicate — `claimVariant` in apps/jobs/src/publish/store.ts
 * — and until 2026-08-08 the second half did not work. `publishing` was missing from
 * the status list, so the lease could only ever be evaluated against rows nobody had
 * claimed: a publisher killed mid-flight left `publishing` + a claim timestamp that no
 * later tick could match, forever. `lease.pglite.test.ts` executes the predicate on a
 * real Postgres (PGlite, in-process) rather than asserting on the SQL string, because
 * the string was right-looking the whole time it was wrong.
 *
 * Five ways to break it, each of which some test must notice.
 *
 *   node scripts/mutation-check.mjs mutations/publish-lease.mjs
 */
export default {
  cwd: 'apps/jobs',
  command: 'pnpm vitest run src/publish/lease.pglite.test.ts',
  mutants: [
    {
      name: 'the lease can never release a claimed variant (the original bug)',
      file: 'apps/jobs/src/publish/store.ts',
      find: "          and (publish_status in ('pending', 'scheduled', 'failed', 'publishing')",
      replace: "          and (publish_status in ('pending', 'scheduled', 'failed')",
    },
    {
      name: 'a live claim can be stolen mid-publish',
      file: 'apps/jobs/src/publish/store.ts',
      find:
        '          and (publish_claimed_at is null\n' +
        '               or publish_claimed_at < now() - make_interval(secs => $4::int))',
      replace: '          and (publish_claimed_at is null or publish_claimed_at is not null)',
    },
    {
      name: 'a published variant can be claimed again and posted twice',
      file: 'apps/jobs/src/publish/store.ts',
      find: "          and (publish_status in ('pending', 'scheduled', 'failed', 'publishing')",
      replace:
        "          and (publish_status in ('pending', 'scheduled', 'failed', 'publishing', 'published')",
    },
    {
      name: 'a fixture-published variant is stranded for ever (the 2026-09-02 defect)',
      file: 'apps/jobs/src/publish/store.ts',
      find: "               or (publish_status = 'published' and permalink like 'fixture://%'))",
      replace: '               or false)',
    },
    {
      name: 'the fixture exception widens to every published variant',
      file: 'apps/jobs/src/publish/store.ts',
      find: "               or (publish_status = 'published' and permalink like 'fixture://%'))",
      replace: "               or publish_status = 'published')",
    },
    {
      name: 'a late release undoes a terminal outcome',
      file: 'apps/jobs/src/publish/store.ts',
      find: "          and publish_status = 'publishing'",
      replace: '          and true',
    },
    {
      name: 'the lease is one minute rather than ten',
      // MOVED 2026-09-03: the constant now lives in `dispatch/lease.ts`, because
      // the classifier reads it too and `@sahoda/jobs/sweeps` must not import the
      // publishing adapters. `runClaimedPublish` re-exports it, so a mutation
      // aimed at the old file silently found nothing and was recorded SURVIVED.
      file: 'apps/jobs/src/dispatch/lease.ts',
      find: 'export const PUBLISH_LEASE_SECONDS = 600',
      replace: 'export const PUBLISH_LEASE_SECONDS = 60',
    },
  ],
}
