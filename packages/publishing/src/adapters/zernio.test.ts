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
