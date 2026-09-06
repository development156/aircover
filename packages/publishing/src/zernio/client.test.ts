import { describe, it, expect } from 'vitest'

import { fixtureTransport, type RecordedResponse } from '../transport'
import { createZernioClient, ZernioError } from './client'

/**
 * The boundary that decides "published".
 *
 * `parse()` used to return `body as T` after JSON.parse, so the shape that flips
 * a post_variants row to `published` was never validated. These tests drive the
 * REAL client through a recorded transport and assert that a response in the
 * wrong shape is refused with a named code, never handed on as if it were the
 * declared type.
 */

const API_KEY = 'sk_' + 'a'.repeat(64)
const POST_ID = '6a6c9771556939203a9bafac'
const EXISTING_ID = '6a6c9771556939203a9bafad'
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function clientFor(recorded: RecordedResponse) {
  return createZernioClient({
    transport: fixtureTransport({ headers: JSON_HEADERS, ...recorded }),
    apiKey: API_KEY,
  })
}

async function caught(run: () => Promise<unknown>): Promise<ZernioError> {
  try {
    await run()
  } catch (err) {
    if (err instanceof ZernioError) return err
    throw err
  }
  throw new Error('expected a ZernioError and got a value')
}

const wellFormedPost = {
  _id: POST_ID,
  status: 'published',
  platforms: [
    {
      platform: 'instagram',
      status: 'published',
      platformPostId: '18104441855596739',
      platformPostUrl: 'https://www.instagram.com/p/DbdSNpHDbtj/',
    },
  ],
}

describe('Zernio client: createPost is zod-parsed, not cast', () => {
  it('returns a well-formed create response as parsed', async () => {
    const res = await clientFor({ status: 201, body: { post: wellFormedPost } }).createPost({
      content: 'hi',
      platforms: [{ platform: 'instagram', accountId: '6a75caf7d0fe733d1afcc1f4' }],
    })

    expect(res.post?._id).toBe(POST_ID)
    expect(res.post?.platforms?.[0]?.platformPostUrl).toBe(
      'https://www.instagram.com/p/DbdSNpHDbtj/',
    )
  })

  it('refuses a leg whose platformPostUrl is a boolean, as BAD_SHAPE and transient', async () => {
    const body = {
      post: {
        ...wellFormedPost,
        platforms: [{ platform: 'instagram', status: 'published', platformPostUrl: true }],
      },
    }

    const err = await caught(() =>
      clientFor({ status: 201, body }).createPost({
        content: 'hi',
        platforms: [{ platform: 'instagram', accountId: '6a75caf7d0fe733d1afcc1f4' }],
      }),
    )

    expect(err.code).toBe('BAD_SHAPE')
    // The request went out and the post may be live. "Unknown" is transient;
    // "failed" would be a claim nothing here can make.
    expect(err.classification).toBe('transient')
    expect(err.message).toMatch(/createPost/)
    expect(err.message).not.toContain(API_KEY)
  })

  it('refuses a leg whose platformPostUrl is an object, the shape a contract change would take', async () => {
    const body = {
      post: {
        ...wellFormedPost,
        platforms: [
          {
            platform: 'instagram',
            status: 'published',
            platformPostUrl: { url: 'https://www.instagram.com/p/x/', expiresAt: 'never' },
          },
        ],
      },
    }

    const err = await caught(() =>
      clientFor({ status: 201, body }).createPost({
        content: 'hi',
        platforms: [{ platform: 'instagram', accountId: '6a75caf7d0fe733d1afcc1f4' }],
      }),
    )

    expect(err.code).toBe('BAD_SHAPE')
  })

  it('carries the 409 body’s existingPostId on the error so the adapter can name the earlier post', async () => {
    const err = await caught(() =>
      clientFor({
        status: 409,
        body: {
          error: 'Duplicate content detected',
          type: 'conflict_error',
          code: 'DUPLICATE_CONTENT',
          existingPostId: EXISTING_ID,
        },
      }).createPost({
        content: 'hi',
        platforms: [{ platform: 'instagram', accountId: '6a75caf7d0fe733d1afcc1f4' }],
      }),
    )

    expect(err.status).toBe(409)
    expect(err.existingPostId).toBe(EXISTING_ID)
  })

  it('drops an existingPostId that is not a Zernio id rather than carrying free text', async () => {
    const err = await caught(() =>
      clientFor({
        status: 409,
        body: { error: 'Duplicate', code: 'DUPLICATE_CONTENT', existingPostId: '<script>' },
      }).createPost({
        content: 'hi',
        platforms: [{ platform: 'instagram', accountId: '6a75caf7d0fe733d1afcc1f4' }],
      }),
    )

    expect(err.existingPostId).toBeNull()
  })

  it('keeps Zernio’s own code on a 403 so ACCOUNT_DISCONNECTED is distinguishable', async () => {
    const err = await caught(() =>
      clientFor({
        status: 403,
        body: { error: 'Account disconnected', type: 'auth_error', code: 'ACCOUNT_DISCONNECTED' },
      }).createPost({
        content: 'hi',
        platforms: [{ platform: 'instagram', accountId: '6a75caf7d0fe733d1afcc1f4' }],
      }),
    )

    expect(err.status).toBe(403)
    expect(err.code).toBe('ACCOUNT_DISCONNECTED')
    expect(err.existingPostId).toBeNull()
  })
})

describe('Zernio client: getPost is zod-parsed in both envelopes', () => {
  it('unwraps a { post } envelope', async () => {
    const post = await clientFor({ status: 200, body: { post: wellFormedPost } }).getPost(POST_ID)
    expect(post._id).toBe(POST_ID)
  })

  it('accepts a bare post', async () => {
    const post = await clientFor({ status: 200, body: wellFormedPost }).getPost(POST_ID)
    expect(post._id).toBe(POST_ID)
  })

  it('refuses a body with no post id as BAD_SHAPE', async () => {
    const err = await caught(() =>
      clientFor({ status: 200, body: { status: 'published' } }).getPost(POST_ID),
    )
    expect(err.code).toBe('BAD_SHAPE')
    expect(err.message).toMatch(/getPost/)
  })

  it('refuses a leg whose platformPostId is a number', async () => {
    const body = {
      ...wellFormedPost,
      platforms: [
        { platform: 'instagram', status: 'published', platformPostId: 18104441855596739 },
      ],
    }
    const err = await caught(() => clientFor({ status: 200, body }).getPost(POST_ID))
    expect(err.code).toBe('BAD_SHAPE')
  })
})
