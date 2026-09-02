import { describe, it, expect } from 'vitest'
import { AdapterError, type PublishRequest } from '@sahoda/shared'
import { createZernioAdapter } from './zernio'
import { ZERNIO_ID_RE, ZernioError, type ZernioClient, type ZernioPost } from '../zernio/client'

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
    listConnectChoices: unexpected('listConnectChoices') as never,
    telegramCode: unexpected('telegramCode') as never,
    telegramStatus: unexpected('telegramStatus') as never,
    selectConnectChoice: unexpected('selectConnectChoice') as never,
    // Wired to THROW, like the recovery surface below and for the same reason: a
    // publish must never disconnect an account, and this makes that an assertion
    // rather than an assumption.
    disconnectAccount: unexpected('disconnectAccount') as never,
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

/**
 * ── "PUBLISHED" MEANS A LIVE HTTPS LINK, NOT A TRUTHY FIELD ──────────────────
 * The settle loop and the success condition both keyed off `leg.platformPostUrl`
 * being truthy. A `fixture://` string, `true`, or an object would all have been
 * stored as the permalink and the row flipped to `published`. The rule is doc 13
 * §5's: a post is real when there is a link to it on the internet.
 */
async function adapterError(run: () => Promise<unknown>): Promise<AdapterError> {
  try {
    await run()
  } catch (err) {
    if (err instanceof AdapterError) return err
    throw err
  }
  throw new Error('expected an AdapterError and got a value')
}

describe('Zernio adapter — a post is published only on a parsed https permalink', () => {
  it.each([
    ['a fixture scheme', 'fixture://instagram/DbdSNpHDbtj'],
    ['an empty string', ''],
    ['a plain http link', 'http://www.instagram.com/p/DbdSNpHDbtj/'],
    ['a bare path', '/p/DbdSNpHDbtj/'],
  ])('does not report success when the url is %s', async (_label, url) => {
    const err = await adapterError(() =>
      adapterFor(igPost({ platformPostId: IG_MEDIA_ID, platformPostUrl: url })).publish(
        igRequest(),
      ),
    )

    // No live link yet. Transient, so a later read can still find the real one.
    expect(err.code).toBe('STILL_PROCESSING')
    expect(err.classification).toBe('transient')
  })

  it('does not report success when the url is a boolean the client type never promised', async () => {
    const err = await adapterError(() =>
      adapterFor(igPost({ platformPostId: IG_MEDIA_ID, platformPostUrl: true })).publish(
        igRequest(),
      ),
    )

    expect(err.code).toBe('STILL_PROCESSING')
  })

  it('reports success on an https permalink and returns it unchanged', async () => {
    const result = await adapterFor(
      igPost({ platformPostId: IG_MEDIA_ID, platformPostUrl: PERMALINK }),
    ).publish(igRequest())

    expect(result.permalink).toBe(PERMALINK)
    expect(result.mode).toBe('live')
  })
})

/**
 * ── CLASSIFYING WHAT ZERNIO'S 4XX ACTUALLY MEANS ─────────────────────────────
 * The adapter forwarded Zernio's own `code` string and a blanket `permanent`. The
 * publish path only raises the reconnect prompt and marks the connection expired
 * for UNAUTHORIZED and FORBIDDEN, which the native adapters mint from the HTTP
 * status and this one never did. And a 409 (the same words and photos inside 24
 * hours, docs/31 §6.4) is not a failure that a retry can fix.
 */
function failingClient(err: ZernioError): ZernioClient {
  return {
    ...stubClient(igPost({})),
    createPost: async () => {
      throw err
    },
  }
}

function zernioError(status: number, code: string, existingPostId: string | null = null) {
  return new ZernioError({
    message: `createPost: HTTP ${status}`,
    status,
    code,
    type: 'x',
    rateLimit: { limit: null, remaining: null, reset: null },
    existingPostId,
  })
}

describe('Zernio adapter — auth failures name the account and say to reconnect it', () => {
  it('maps a 403 ACCOUNT_DISCONNECTED to FORBIDDEN with a reconnect sentence', async () => {
    const adapter = createZernioAdapter('instagram', {
      client: failingClient(zernioError(403, 'ACCOUNT_DISCONNECTED')),
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const err = await adapterError(() => adapter.publish(igRequest()))

    expect(err.code).toBe('FORBIDDEN')
    expect(err.classification).toBe('permanent')
    expect(err.message).toBe(
      'Instagram is no longer connected to Sahoda. Reconnect it, then publish again.',
    )
    expect(err.raw).toEqual({ status: 403, zernioCode: 'ACCOUNT_DISCONNECTED' })
  })

  it('leaves any other 403 on Zernio’s code, with a sentence that offers no reconnect', async () => {
    const adapter = createZernioAdapter('linkedin', {
      client: failingClient(zernioError(403, 'INSUFFICIENT_PERMISSIONS')),
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const err = await adapterError(() =>
      adapter.publish(
        igRequest({
          content: { channel: 'linkedin', text: 'hello', media: [] },
          media: [],
        } as Partial<PublishRequest>),
      ),
    )

    // Not FORBIDDEN: that code marks the customer's connection expired, and a
    // 403 without ACCOUNT_DISCONNECTED has not said the account is the problem.
    expect(err.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(err.classification).toBe('permanent')
    expect(err.message).toBe('LinkedIn refused Sahoda permission to post this.')
    expect(err.message).not.toMatch(/reconnect/i)
  })

  it('does NOT map a 401 to a reconnect: the bearer is Sahoda’s key, not the customer’s', async () => {
    const adapter = createZernioAdapter('instagram', {
      client: failingClient(zernioError(401, 'UNAUTHORIZED')),
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const err = await adapterError(() => adapter.publish(igRequest()))

    expect(err.code).toBe('PROVIDER_UNAUTHORIZED')
    expect(err.code).not.toBe('UNAUTHORIZED')
    expect(err.classification).toBe('permanent')
    expect(err.message).toBe(
      "Sahoda could not sign in to its publishing service, so nothing was sent to Instagram. This is on Sahoda's side, not your account.",
    )
  })

  it('leaves an unrelated 4xx as Zernio classified it, code intact', async () => {
    const adapter = createZernioAdapter('instagram', {
      client: failingClient(zernioError(400, 'VALIDATION_ERROR')),
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const err = await adapterError(() => adapter.publish(igRequest()))

    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.classification).toBe('permanent')
  })
})

describe('Zernio adapter — a 409 duplicate is "already posted", not a failure to retry', () => {
  const EXISTING = '6a6c9771556939203a9bafad'

  it('classifies the 409 as ALREADY_POSTED and says what to change', async () => {
    const adapter = createZernioAdapter('instagram', {
      client: failingClient(zernioError(409, 'DUPLICATE_CONTENT', EXISTING)),
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const err = await adapterError(() => adapter.publish(igRequest()))

    expect(err.code).toBe('ALREADY_POSTED')
    // Permanent: a retry sends the same words to the same 24-hour window.
    expect(err.classification).toBe('permanent')
    expect(err.message).toBe(
      'Instagram already has a post with these exact words and photos from the last 24 hours, so this one was not sent again. Change the wording or a photo to post it.',
    )
    // The earlier post's Zernio id rides on `raw.postId`, the shape the publish
    // log already lifts into its handle column.
    expect(err.raw).toEqual({ status: 409, zernioCode: 'DUPLICATE_CONTENT', postId: EXISTING })
  })

  it('still classifies a 409 with no existingPostId as ALREADY_POSTED', async () => {
    const adapter = createZernioAdapter('instagram', {
      client: failingClient(zernioError(409, 'DUPLICATE_CONTENT')),
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const err = await adapterError(() => adapter.publish(igRequest()))

    expect(err.code).toBe('ALREADY_POSTED')
    expect(err.raw).toEqual({ status: 409, zernioCode: 'DUPLICATE_CONTENT' })
  })
})

/**
 * ── THE READER GETS A NAME, NOT A KEY ─────────────────────────────────────────
 * `${channel}` is the lowercase enum key. "gbp allows 1 media items" reached the
 * publish button verbatim (api-contracts-1). Every sentence here now goes through
 * CHANNEL_LABELS.
 */
describe('Zernio adapter — refusal sentences name the channel, never the enum key', () => {
  const gbpRequest = (mediaCount: number): PublishRequest => {
    const media = Array.from({ length: mediaCount }, (_, i) => ({
      url: `https://media.zernio.com/media/${i}.jpg`,
      mime: 'image/jpeg',
    }))
    return igRequest({
      content: { channel: 'gbp', summary: 'Open today.', media },
      media,
    } as unknown as Partial<PublishRequest>)
  }

  it('says "Google Business Profile allows 1 attachment per post", not "gbp"', async () => {
    const adapter = createZernioAdapter('gbp', {
      client: stubClient(igPost({})),
      poll: { attempts: 1, intervalMs: 0 },
      sleep: async () => {},
      now: () => FIXED_NOW,
    })

    const err = await adapterError(() => adapter.publish(gbpRequest(2)))

    expect(err.code).toBe('MAX_MEDIA_COUNT')
    expect(err.message).toBe('Google Business Profile allows 1 attachment per post.')
    expect(err.message).not.toMatch(/\bgbp\b/)
  })

  it('says "Instagram needs at least one photo", not "instagram"', async () => {
    const err = await adapterError(() =>
      adapterFor(igPost({})).publish(
        igRequest({
          content: { channel: 'instagram', caption: 'hi', media: [] },
          media: [],
        } as Partial<PublishRequest>),
      ),
    )

    expect(err.code).toBe('MEDIA_REQUIRED')
    expect(err.message).toBe(
      'Instagram needs at least one photo. There is no text-only post there.',
    )
    expect(err.message).not.toMatch(/\binstagram\b/)
  })

  it('names the channel in the still-processing sentence', async () => {
    const err = await adapterError(() =>
      adapterFor(igPost({ status: 'processing' })).publish(igRequest()),
    )

    expect(err.code).toBe('STILL_PROCESSING')
    expect(err.message).toBe('Instagram is still processing this post. There is no live link yet.')
  })

  it('names the channel in the refusal sentence', async () => {
    const err = await adapterError(() =>
      adapterFor(igPost({ status: 'failed', error: 'Media too small' })).publish(igRequest()),
    )

    expect(err.code).toBe('PLATFORM_REJECTED')
    expect(err.message).toBe('Instagram refused this post: Media too small')
  })
})
