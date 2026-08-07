import type { Pool } from 'pg'
import type { BriefInsert } from './plan-week-job'

/**
 * Lands plan_week briefs as `posts` rows. One statement for the whole batch so a partial
 * insert cannot leave the user charged for a plan they only half received.
 */
export function createPostsStore(opts: { pool: Pool }) {
  async function insertBriefs(workspaceId: string, briefs: BriefInsert[]): Promise<number> {
    if (briefs.length === 0) return 0

    const r = await opts.pool.query(
      `insert into posts (workspace_id, title, body, status, channels, scheduled_at, origin)
       select $1,
              b.title,
              b.body,
              'idea',
              b.channels,
              b.scheduled_at::timestamptz,
              'plan_week'
         from jsonb_to_recordset($2::jsonb)
           as b(title text, body text, channels text[], scheduled_at text)`,
      [
        workspaceId,
        JSON.stringify(
          briefs.map((b) => ({
            title: b.title,
            body: b.body,
            channels: b.channels,
            scheduled_at: b.scheduledAt,
          })),
        ),
      ],
    )
    return r.rowCount ?? 0
  }

  return { insertBriefs }
}
