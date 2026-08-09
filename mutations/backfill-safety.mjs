/**
 * THE RULE: the backfill fills a null analytics key, for real posts only, once — and
 * it cannot publish.
 *
 * Four ways that breaks, one per property the caller depends on. The fourth is the one
 * that would not show up in any behavioural test: a backfill that can REACH the publish
 * path is a pass that walks every published variant and re-posts it, which is SL-069
 * arriving through a different door. Only the import-graph guard notices, so this proves
 * the guard actually bites.
 *
 *   node scripts/mutation-check.mjs mutations/backfill-safety.mjs
 */
export default {
  cwd: 'apps/jobs',
  command: 'pnpm vitest run src/backfill/',
  mutants: [
    {
      name: 'fixture posts are backfilled — a real metrics key minted for a simulated post',
      file: 'apps/jobs/src/backfill/store.ts',
      find: "          and permalink not like 'fixture://%'\n",
      replace: '',
    },
    {
      name: 'the update is no longer write-once and can clobber a correct id',
      file: 'apps/jobs/src/backfill/store.ts',
      find: '        where id = $1\n          and platform_post_id is null',
      replace: '        where id = $1',
    },
    {
      name: 'the pass is unbounded',
      file: 'apps/jobs/src/backfill/store.ts',
      find: '        order by updated_at asc\n        limit $1',
      replace: '        order by updated_at asc',
    },
    {
      name: 'the backfill can reach the publish path',
      file: 'apps/jobs/src/backfill/store.ts',
      find: "import type { Pool } from 'pg'",
      replace:
        "import type { Pool } from 'pg'\n" +
        "import { runPublishPost } from '../publish/runPublishPost'",
    },
  ],
}
