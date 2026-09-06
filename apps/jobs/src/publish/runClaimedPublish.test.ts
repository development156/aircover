import { describe, it, expect, vi } from 'vitest'
import type { PublishPostPayload } from '@sahoda/shared'
import { PublishInfraError, runClaimedPublish, type ClaimedPublishDeps } from './runClaimedPublish'

const payload: PublishPostPayload = {
  workspaceId: 'ws-1',
  postId: 'post-1',
  variantId: 'var-1',
  channel: 'instagram',
  scheduledAt: '2026-08-08T00:00:00.000Z',
}

const ctx = { attempt: 1, jobRunId: 'test:1' }

/** Enough of the deps to exercise the claim seam; the rest is never reached. */
function deps(over: Partial<ClaimedPublishDeps> = {}): ClaimedPublishDeps {
  return {
    mode: 'live',
    claimVariant: async () => true,
    releaseVariant: async () => {},
    loadVariant: async () => null,
    resolveConnection: async () => {
      throw new Error('unused')
    },
    adapterFor: () => {
      throw new Error('unused')
    },
    writeLog: async () => {},
    markVariant: async () => {},
    recordPublished: async () => {},
    ...over,
  } as ClaimedPublishDeps
}

/**
 * The 2026-08-07 incident in one test.
 *
 * Four publishes returned an anonymous 503 with NO post_publish_logs row, and the logs
 * could not say why. The row could not be written because the row is a Postgres write
 * and Postgres was the thing that was unreachable — SUPABASE_DB_URL pointed at the
 * IPv6-only direct host. `claimVariant` is the first statement that touches it.
 */
describe('a database that is unreachable is not reported as a failed publish', () => {
  it('classifies a throwing claimVariant as PublishInfraError at the claim stage', async () => {
    const err = await runClaimedPublish(
      payload,
      ctx,
      deps({
        claimVariant: async () => {
          throw new Error('connect ECONNREFUSED / Network is unreachable')
        },
      }),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(PublishInfraError)
    expect((err as PublishInfraError).stage).toBe('claim')
    // The cause survives for Sentry — this is the only record that will exist.
    expect((err as PublishInfraError).message).toContain('Network is unreachable')
  })

  it('does not try to release a claim it never took', async () => {
    const releaseVariant = vi.fn(async () => {})

    await runClaimedPublish(
      payload,
      ctx,
      deps({
        claimVariant: async () => {
          throw new Error('down')
        },
        releaseVariant,
      }),
    ).catch(() => {})

    // Releasing here would issue a second doomed statement and could mask the cause.
    expect(releaseVariant).not.toHaveBeenCalled()
  })

  it('still reports a LOST claim as not-claimed, which is not an error at all', async () => {
    const result = await runClaimedPublish(payload, ctx, deps({ claimVariant: async () => false }))

    expect(result).toEqual({ claimed: false, reason: 'already-claimed' })
  })

  it('leaves a genuine publish failure alone — it is not an infra error', async () => {
    const boom = new Error('adapter gave up')
    const err = await runClaimedPublish(
      payload,
      ctx,
      deps({
        claimVariant: async () => true,
        loadVariant: async () => {
          throw boom
        },
      }),
    ).catch((e: unknown) => e)

    expect(err).toBe(boom)
    expect(err).not.toBeInstanceOf(PublishInfraError)
  })
})
