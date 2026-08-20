import { describe, it, expect } from 'vitest'
import { type PublishRequest } from '@sahoda/shared'
import { createZernioAdapter } from './zernio'
import { ZERNIO_ID_RE, type ZernioClient, type ZernioPost } from '../zernio/client'

const FIXED_NOW = new Date('2026-08-08T00:00:00.000Z')

/** A 24-char hex Zernio id — the value that must never become a platformPostId. */
const ZERNIO_POST_ID = '6a6c9771556939203a9bafac'
/** Instagram's real media id: 17 decimal digits, which is NOT 24-hex. */
const IG_MEDIA_ID = '18104441855596739'
const ACCOUNT_ID = '6a75caf7d0fe733d1afcc1f4'
const PERMALINK = 'https://www.instagram.com/p/DbdSNpHDbtj/'

function igRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    workspaceId: 'ws-1',
    postId: 'post-1',
    variantId: 'var-1',
    content: {
      channel: 'instagram',
      caption: 'Fresh chai just dropped.',
      media: [{ url: 'https://media.zernio.com/media/x.jpg', mime: 'image/jpeg' }],
    },
    media: [{ url: 'https://media.zernio.com/media/x.jpg', mime: 'image/jpeg' }],
    auth: { connectionId: 'conn-1', accessToken: '', externalAccountId: ACCOUNT_ID },
    ...overrides,
  } as PublishRequest
}

/**
 * A ZernioClient stub that returns one canned post. Only createPost and getPost are
 * exercised by publish(); the rest throw so an unexpected call is loud, not silent.
 */
function stubClient(post: ZernioPost): ZernioClient {
  const unexpected = (name: string) => () => {
    throw new Error(`unexpected ${name} call`)
  }
  return {
    createPost: async () => ({ post }),
    getPost: async () => post,
    listProfiles: unexpected('listProfiles') as never,
    createProfile: unexpected('createProfile') as never,
    connectUrl: unexpected('connectUrl') as never,
    listAccounts: unexpected('listAccounts') as never,
    presignMedia: unexpected('presignMedia') as never,
    uploadMedia: unexpected('uploadMedia') as never,
    headMedia: unexpected('headMedia') as never,
    // ── THE RECOVERY SURFACE, WIRED TO THROW ──────────────────────────────────
    // A publish must never edit, unpublish or retry, and these make that an
    // assertion rather than an assumption: every test in this file fails loudly
    // if the adapter reaches one. TypeScript required them to be added; what they
    // are wired TO is the choice that makes them worth something.
    editPost: unexpected('editPost') as never,
    unpublishPost: unexpected('unpublishPost') as never,
    retryPost: unexpected('retryPost') as never,
  }
}

function igPost(leg: Record<string, unknown>): ZernioPost {
  return {
    _id: ZERNIO_POST_ID,
    status: 'published',
    platforms: [{ platform: 'instagram', status: 'published', ...leg } as never],
  }
}

const adapterFor = (post: ZernioPost) =>
  createZernioAdapter('instagram', {
    client: stubClient(post),
    poll: { attempts: 1, intervalMs: 0 },
    sleep: async () => {},
    now: () => FIXED_NOW,
  })

/**
 * A client whose `getPost` answers with a LATER state than `createPost` did, and
 * counts how many times it was asked.
 *
 * `stubClient` cannot express this — it hands back one frozen post for both calls, so
 * a re-read is indistinguishable from no re-read. That is exactly the gap the tests
 * below are about.
 */
function twoPhaseClient(
  created: ZernioPost,
  settled: ZernioPost,
): { client: ZernioClient; reads: () => number } {
  let reads = 0
  const base = stubClient(created)
  return {
    client: {
      ...base,
      createPost: async () => ({ post: created }),
      getPost: async () => {
        reads += 1
        return settled
      },
    },
    reads: () => reads,
  }
}

describe('Zernio adapter — platformPostId is the PLATFORM id, never Zernio ours', () => {
  it("returns the platform's own id when the leg carries one", async () => {
    const result = await adapterFor(
      igPost({ platformPostId: IG_MEDIA_ID, platformPostUrl: PERMALINK }),
    ).publish(igRequest())

    expect(result.platformPostId).toBe(IG_MEDIA_ID)
    expect(result.permalink).toBe(PERMALINK)
    expect(result.mode).toBe('live')
  })

  /**
   * The regression this file exists for.
   *
   * `leg.platformPostId ?? post._id` put Zernio's own 24-hex id into
   * post_variants.platform_post_id — the column analytics keys off. Querying Zernio's
   * analytics by that id returns HTTP 202 with every metric 0, permanently, once the
   * account is reconnected (observed [LIVE] 2026-08-08 against the 31 July post).
   *
   * Null is the honest answer: unknown, rather than confidently wrong.
   */
  it('returns null — NOT Zernio’s _id — when the leg carries no platform id', async () => {
    const result = await adapterFor(igPost({ platformPostUrl: PERMALINK })).publish(igRequest())

    expect(result.platformPostId).toBeNull()
    expect(result.platformPostId).not.toBe(ZERNIO_POST_ID)
    // The post is still a real success: there is a link to it on the internet.
    expect(result.permalink).toBe(PERMALINK)
    expect(result.mode).toBe('live')
  })

  it('never returns a 24-hex Zernio id as the platformPostId, whatever the leg says', async () => {
    const result = await adapterFor(
      igPost({ platformPostId: ZERNIO_POST_ID, platformPostUrl: PERMALINK }),
    ).publish(igRequest())

    expect(result.platformPostId === null || !ZERNIO_ID_RE.test(result.platformPostId)).toBe(true)
  })
})

/**
 * The exit condition of the settle loop.
 *
 * `waitForUrl` used to stop the moment the leg carried `platformPostUrl` and then read
 * `platformPostId` off that same snapshot. Those are SIBLING fields: when Zernio fills
 * the URL first, the loop returns on the very first check and the id — the analytics
 * key — is read as absent and never asked for again. The post is a real success with a
 * permanently unresolvable Performance panel.
 *
 * The URL still terminates the loop; what changed is that an absent id buys one more
 * read before we accept it. Bounded by the same attempt budget, so a Zernio that never
 * issues an id costs one extra GET and still returns the URL — never a stall.
 */
describe('Zernio adapter — the settle loop re-reads for the platform id', () => {
  it('re-reads once when the create response carries a URL but no platform id', async () => {
    const { client, reads } = twoPhaseClient(
      igPost({ platformPostUrl: PERMALINK }),
      igPost({ platformPostUrl: PERMALINK, platformPostId: IG_MEDIA_ID }),
    )
    const adapter = createZernioAdapter('instagram', {
      client,
      poll: { attempts: 4, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const result = await adapter.publish(igRequest())

    expect(result.platformPostId).toBe(IG_MEDIA_ID)
    expect(result.permalink).toBe(PERMALINK)
    expect(reads()).toBeGreaterThanOrEqual(1)
  })

  it('does not re-read when the create response already carries the platform id', async () => {
    const { client, reads } = twoPhaseClient(
      igPost({ platformPostUrl: PERMALINK, platformPostId: IG_MEDIA_ID }),
      igPost({ platformPostUrl: PERMALINK, platformPostId: IG_MEDIA_ID }),
    )
    const adapter = createZernioAdapter('instagram', {
      client,
      poll: { attempts: 4, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const result = await adapter.publish(igRequest())

    expect(result.platformPostId).toBe(IG_MEDIA_ID)
    // The happy path must not pay for the fix.
    expect(reads()).toBe(0)
  })

  it('still succeeds with a null id when the re-read never produces one', async () => {
    const { client, reads } = twoPhaseClient(
      igPost({ platformPostUrl: PERMALINK }),
      igPost({ platformPostUrl: PERMALINK }),
    )
    const adapter = createZernioAdapter('instagram', {
      client,
      poll: { attempts: 3, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const result = await adapter.publish(igRequest())

    // A URL and no id is still a real publish — it must not become STILL_PROCESSING.
    expect(result.permalink).toBe(PERMALINK)
    expect(result.platformPostId).toBeNull()
    expect(result.mode).toBe('live')
    // Bounded: one extra read, not the whole attempt budget.
    expect(reads()).toBe(1)
  })
})

/**
 * ── THE OTHER HALF OF THE SEAM ──────────────────────────────────────────────
 * `platform-data.test.ts` proves the builder returns the right object. That
 * proves nothing on its own: the state this work found was a composer writing
 * `extras.gbpCta` into a database and NOTHING between there and Google reading
 * it, and a builder with no caller reproduces that exactly.
 *
 * So these assert the WIRE BODY — the argument `createPost` was actually handed.
 */
function capturingClient(post: ZernioPost): {
  client: ZernioClient
  sent: () => Record<string, unknown> | null
} {
  let sent: Record<string, unknown> | null = null
  const base = stubClient(post)
  return {
    client: {
      ...base,
      createPost: async (input) => {
        sent = input as unknown as Record<string, unknown>
        return { post }
      },
    },
    sent: () => sent,
  }
}

type SentPlatforms = { platforms: { platform: string; platformSpecificData?: unknown }[] }

describe('the per-channel half actually reaches the request', () => {
  it('puts contentType story on the platform entry, not at the root', async () => {
    const { client, sent } = capturingClient(igPost({ platformPostUrl: PERMALINK }))
    await createZernioAdapter('instagram', {
      client,
      format: 'story',
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    }).publish(igRequest())

    const body = sent() as unknown as SentPlatforms & Record<string, unknown>
    expect(body.platforms[0]!.platformSpecificData).toEqual({ contentType: 'story' })
    // Zernio has no root-level equivalent; a value there would be ignored.
    expect(body.platformSpecificData).toBeUndefined()
  })

  it('sends no platformSpecificData key at all for an ordinary post', async () => {
    const { client, sent } = capturingClient(igPost({ platformPostUrl: PERMALINK }))
    await createZernioAdapter('instagram', {
      client,
      format: 'image',
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    }).publish(igRequest())

    const entry = (sent() as unknown as SentPlatforms).platforms[0]!
    expect('platformSpecificData' in entry).toBe(false)
  })

  it('carries the Google button through to the wire', async () => {
    const post: ZernioPost = {
      _id: ZERNIO_POST_ID,
      status: 'published',
      platforms: [
        { platform: 'google', status: 'published', platformPostUrl: 'https://g.example/p/1' },
      ],
    }
    const { client, sent } = capturingClient(post)
    await createZernioAdapter('gbp', {
      client,
      format: 'text',
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    }).publish({
      workspaceId: 'ws-1',
      postId: 'post-1',
      variantId: 'var-1',
      content: {
        channel: 'gbp',
        summary: 'Open till 9 today',
        media: [],
        ctaType: 'ORDER',
        ctaUrl: 'https://chai.example/order',
      },
      media: [],
      auth: { connectionId: 'conn-1', accessToken: '', externalAccountId: ACCOUNT_ID },
    } as PublishRequest)

    expect((sent() as unknown as SentPlatforms).platforms[0]!.platformSpecificData).toEqual({
      callToAction: { type: 'ORDER', url: 'https://chai.example/order' },
    })
  })

  it('refuses a Google button with no destination instead of publishing without it', async () => {
    const { client, sent } = capturingClient(igPost({ platformPostUrl: PERMALINK }))
    await expect(
      createZernioAdapter('gbp', {
        client,
        format: 'text',
        poll: { attempts: 1, intervalMs: 0 },
        sleep: async () => {},
        now: () => FIXED_NOW,
      }).publish({
        workspaceId: 'ws-1',
        postId: 'post-1',
        variantId: 'var-1',
        content: { channel: 'gbp', summary: 'Open till 9', media: [], ctaType: 'ORDER' },
        media: [],
        auth: { connectionId: 'conn-1', accessToken: '', externalAccountId: ACCOUNT_ID },
      } as PublishRequest),
    ).rejects.toMatchObject({ code: 'GBP_CTA_NEEDS_URL', classification: 'permanent' })
    // And nothing was sent. A refusal that still posts is not a refusal.
    expect(sent()).toBeNull()
  })

  it('types a GIF as a gif, which the hardcoded literal could never do', async () => {
    const { client, sent } = capturingClient(igPost({ platformPostUrl: PERMALINK }))
    await createZernioAdapter('instagram', {
      client,
      format: 'image',
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    }).publish(
      igRequest({
        content: {
          channel: 'instagram',
          caption: 'chai',
          media: [{ url: 'https://media.zernio.com/media/x.gif', mime: 'image/gif' }],
        },
      }),
    )

    const body = sent() as unknown as { mediaItems: { type: string }[] }
    expect(body.mediaItems[0]!.type).toBe('gif')
  })
})

describe('an X thread on the wire', () => {
  const xPost: ZernioPost = {
    _id: ZERNIO_POST_ID,
    status: 'published',
    platforms: [{ platform: 'x', status: 'published', platformPostUrl: 'https://x.com/s/1' }],
  }
  const xRequest = (text: string) => ({
    workspaceId: 'ws-1',
    postId: 'post-1',
    variantId: 'var-1',
    content: { channel: 'x' as const, text, media: [] },
    media: [],
    auth: {
      connectionId: 'conn-1',
      accessToken: 'tok',
      externalAccountId: '0123456789abcdef01234567',
    },
  })

  it('sends threadItems, and the ROOT content is the first segment', async () => {
    const segments = ['First post of the thread.', 'Second post.', 'Third and last.']
    const { client, sent } = capturingClient(xPost)
    await createZernioAdapter('x', {
      client,
      format: 'thread',
      thread: { segments },
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    }).publish(xRequest(segments.join(' ')))

    const body = sent() as unknown as SentPlatforms & Record<string, unknown>
    expect(body.platforms[0]!.platformSpecificData).toEqual({
      threadItems: segments.map((content) => ({ content })),
    })

    // ── THE ROOT IS THE FIRST POST, AND BOTH THINGS ARE TRUE AT ONCE ─────────
    // Zernio's spec says the root `content` "is NOT published" when threadItems
    // is present — and their validator STILL measures it against 280 and refuses
    // a longer one (MEASURED, docs/32 §4.1). Sending the whole body there would
    // be refused; sending the first segment satisfies both.
    expect(body.content).toBe(segments[0])
    expect(body.content).not.toBe(segments.join(' '))
  })

  /**
   * ── THE SILENT-DEFAULT DEFECT, AS A TEST ─────────────────────────────────
   * A `'thread'` that reaches the adapter with no plan must REFUSE. The
   * tempting behaviour is to fall through and publish the body as one tweet:
   * it succeeds, the log looks clean, and a five-part thread went out as a
   * single truncated post. This repo has shipped that shape of defect twice
   * from an optional parameter quietly taking its default.
   */
  it('refuses a thread that arrives with no segments rather than posting the body', async () => {
    const { client, sent } = capturingClient(xPost)
    await expect(
      createZernioAdapter('x', {
        client,
        format: 'thread',
        poll: { attempts: 1, intervalMs: 0 },
        sleep: async () => {},
        now: () => FIXED_NOW,
      }).publish(xRequest('A body that must not go out on its own.')),
    ).rejects.toThrow(/no parts to post/)
    // And nothing was sent. A refusal that still hits the network is not a refusal.
    expect(sent()).toBeNull()
  })

  it('refuses an empty segment list for the same reason', async () => {
    const { client } = capturingClient(xPost)
    await expect(
      createZernioAdapter('x', {
        client,
        format: 'thread',
        thread: { segments: [] },
        poll: { attempts: 1, intervalMs: 0 },
        sleep: async () => {},
        now: () => FIXED_NOW,
      }).publish(xRequest('body')),
    ).rejects.toThrow(/no parts to post/)
  })

  it('ignores a stray plan when the format is not a thread', async () => {
    const { client, sent } = capturingClient(xPost)
    await createZernioAdapter('x', {
      client,
      format: 'text',
      thread: { segments: ['stray', 'segments'] },
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    }).publish(xRequest('The real body.'))

    const body = sent() as unknown as SentPlatforms & Record<string, unknown>
    expect('platformSpecificData' in body.platforms[0]!).toBe(false)
    // And the BODY is still the body. The first draft read the root from the plan
    // whenever one was present, so a plan handed to a non-thread post replaced the
    // writer's words with its first segment — a caller's mistake becoming a wrong
    // post rather than an error. The root now follows the FORMAT.
    expect(body.content).toBe('The real body.')
  })
})
