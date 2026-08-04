import { CONSTRAINTS } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import {
  ALLOWED_MEDIA_TYPES,
  MediaPathError,
  extensionForMime,
  mediaObjectPath,
} from './media-path'

const WORKSPACE = '11111111-1111-4111-8111-111111111111'
const POST = '22222222-2222-4222-8222-222222222222'
const OBJECT = '33333333-3333-4333-8333-333333333333'

/** Letter-bearing uuids — the only fixtures that can actually exercise case folding. */
const HEX_LOWER = 'abcdef12-3456-4abc-8def-abcdef123456'
const HEX_LOWER_B = 'facade01-beef-4dad-9fed-0ddba11ac1de'
const HEX_LOWER_C = 'deadbeef-cafe-4bad-8ace-fedcba987654'

interface Args {
  workspaceId: string
  postId: string
  objectId: string
  mime: string
}

function args(overrides: Partial<Args> = {}): Args {
  return { workspaceId: WORKSPACE, postId: POST, objectId: OBJECT, mime: 'image/png', ...overrides }
}

/** The four types every channel spec draws from. Video appears nowhere in the product. */
const ALLOWED: readonly (readonly [mime: string, ext: string])[] = [
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]

describe('extensionForMime', () => {
  for (const [mime, ext] of ALLOWED) {
    test(`maps ${mime} to .${ext}`, () => {
      expect(extensionForMime(mime)).toBe(ext)
    })
  }

  test('stays in lockstep with the Constraint Engine — it maps exactly the mimes the specs accept', () => {
    // The extension table cannot be derived from CONSTRAINTS (there is no extension
    // in a PlatformSpec), so it is written out by hand. This test is what keeps the
    // hand-written copy honest: if shared ever adds or drops a media type, the two
    // fall out of step here rather than in production.
    //
    // It compares the MODULE's own table (ALLOWED_MEDIA_TYPES) against the specs,
    // not this file's `ALLOWED` fixture. Comparing the fixture to CONSTRAINTS only
    // proves the fixture is current — it says nothing about what the module accepts,
    // and an extra entry in the module's table sailed through an earlier version of
    // this test.
    const fromSpecs = [...new Set(Object.values(CONSTRAINTS).flatMap((s) => s.mediaTypes))].sort()
    expect([...ALLOWED_MEDIA_TYPES].sort()).toEqual(fromSpecs)
    // …and the fixture used by the mapping tests below tracks the same set.
    expect([...new Set(ALLOWED.map(([mime]) => mime))].sort()).toEqual(fromSpecs)
  })

  test('maps every spec mime and refuses everything outside the specs', () => {
    // The two directions the set-equality above implies, asserted through the
    // public function so the exported list cannot claim membership the lookup
    // does not honour.
    const fromSpecs = new Set(Object.values(CONSTRAINTS).flatMap((s) => s.mediaTypes))
    for (const mime of fromSpecs) {
      expect(extensionForMime(mime)).not.toBeNull()
    }
    for (const mime of ALLOWED_MEDIA_TYPES) {
      expect(fromSpecs.has(mime)).toBe(true)
      expect(extensionForMime(mime)).not.toBeNull()
    }
  })

  test('refuses image types no spec lists, so a key is never minted for a MEDIA_TYPE reject', () => {
    // A type present here but absent from every spec is the dangerous direction:
    // mediaObjectPath would hand back a storage key for bytes that validateMedia
    // then rejects with MEDIA_TYPE — an upload written to disk that can never post.
    for (const mime of ['image/bmp', 'image/tiff', 'image/avif', 'image/heic', 'image/jpg']) {
      expect(extensionForMime(mime)).toBeNull()
      expect(ALLOWED_MEDIA_TYPES).not.toContain(mime)
    }
  })

  test('returns null for a video type, which no channel accepts', () => {
    expect(extensionForMime('video/mp4')).toBeNull()
  })

  test('returns null for image/svg+xml, an image type deliberately absent from every spec', () => {
    // SVG is script-bearing. It is not in any spec's mediaTypes, and this module
    // must not be the place that quietly readmits it.
    expect(extensionForMime('image/svg+xml')).toBeNull()
  })

  test('returns null for a mime whose case differs, because spec.mediaTypes matches exactly', () => {
    // validateMedia does `spec.mediaTypes.includes(media.mime)` — an exact,
    // case-sensitive compare. Accepting 'image/JPEG' here would mint a storage path
    // for a file the Constraint Engine then rejects with MEDIA_TYPE.
    expect(extensionForMime('image/JPEG')).toBeNull()
    expect(extensionForMime('IMAGE/PNG')).toBeNull()
  })

  test('returns null for a mime carrying parameters rather than reading the type off the front', () => {
    expect(extensionForMime('image/png; charset=binary')).toBeNull()
    expect(extensionForMime('image/png;')).toBeNull()
  })

  test('returns null for a mime with surrounding whitespace rather than trimming it', () => {
    expect(extensionForMime(' image/png')).toBeNull()
    expect(extensionForMime('image/png ')).toBeNull()
    expect(extensionForMime('image/png\n')).toBeNull()
  })

  test('returns null for inherited Object keys instead of an extension off the prototype chain', () => {
    // A plain object literal as the lookup table would answer 'constructor' with
    // Object and 'toString' with a function — both truthy, neither an extension.
    expect(extensionForMime('constructor')).toBeNull()
    expect(extensionForMime('__proto__')).toBeNull()
    expect(extensionForMime('toString')).toBeNull()
    expect(extensionForMime('hasOwnProperty')).toBeNull()
  })

  test('returns null for the empty string', () => {
    expect(extensionForMime('')).toBeNull()
  })
})

describe('mediaObjectPath — happy path', () => {
  for (const [mime, ext] of ALLOWED) {
    test(`builds <workspace>/<post>/<object>.${ext} for ${mime}`, () => {
      expect(mediaObjectPath(args({ mime }))).toBe(`${WORKSPACE}/${POST}/${OBJECT}.${ext}`)
    })
  }

  test('puts the workspace id in the first path segment, which is what the RLS policy reads', () => {
    // storage.objects policy: nullif((storage.foldername(name))[1], '')::uuid
    //   in (select app.member_workspace_ids())
    const segments = mediaObjectPath(args()).split('/')
    expect(segments[0]).toBe(WORKSPACE)
  })

  test('builds exactly three segments, so the workspace prefix is never nested deeper', () => {
    expect(mediaObjectPath(args()).split('/')).toHaveLength(3)
  })

  test('lowercases the id segments so one object can only ever have one path', () => {
    // Postgres casts the first segment to uuid, which is case-insensitive, so an
    // uppercase id would pass RLS at a second, different storage key for the same
    // workspace. Normalising keeps the object addressable by exactly one string.
    //
    // These fixtures MUST carry hex letters. WORKSPACE/POST/OBJECT are all digits
    // and dashes, so `.toUpperCase()` on them is a no-op — an earlier version of
    // this test used them and passed happily against an implementation that did no
    // normalising at all.
    expect(HEX_LOWER).not.toBe(HEX_LOWER.toUpperCase())

    const upper = mediaObjectPath({
      workspaceId: HEX_LOWER.toUpperCase(),
      postId: HEX_LOWER_B.toUpperCase(),
      objectId: HEX_LOWER_C.toUpperCase(),
      mime: 'image/png',
    })
    expect(upper).toBe(`${HEX_LOWER}/${HEX_LOWER_B}/${HEX_LOWER_C}.png`)
  })

  test('accepts a mixed-case uuid and still emits the single lowercase key', () => {
    const mixed = 'AbCdEf12-3456-4aBc-8DeF-abcDEF123456'
    expect(mediaObjectPath(args({ objectId: mixed }))).toBe(
      `${WORKSPACE}/${POST}/${mixed.toLowerCase()}.png`,
    )
  })
})

/**
 * Every value below must be REFUSED rather than concatenated. The ids reach this
 * function from the server session and the database, but the function is the last
 * place that can guarantee the workspace prefix, so it re-checks them itself.
 */
const REJECTED: readonly (readonly [label: string, value: string])[] = [
  ['a parent-directory hop', '..'],
  ['a single dot', '.'],
  ['an embedded slash', 'a/b'],
  ['a URL-encoded dot-dot', '%2e%2e'],
  ['a URL-encoded slash', '%2f'],
  ['a URL-encoded traversal', '%2e%2e%2f'],
  ['a backslash', '..\\..'],
  ['a bare backslash', '\\'],
  ['the empty string', ''],
  ['a whitespace-only string', '   '],
  ['a newline', '\n'],
  ['a tab', '\t'],
  ['a non-uuid string', 'not-a-uuid'],
  ['an absolute path', '/etc/passwd'],
  ['a relative traversal path', '../../etc/passwd'],
  ['a null byte', '\u0000'],
  [`a uuid truncated by a null byte`, `${WORKSPACE}\u0000/../etc`],
  ['a uuid with a leading space', ` ${WORKSPACE}`],
  ['a uuid with a trailing space', `${WORKSPACE} `],
  // JS `$` is end-of-input, not end-of-line, but the guard must not DEPEND on that
  // subtlety — a regex ported to a language with lenient `$` would let this through.
  ['a uuid with a trailing newline', `${WORKSPACE}\n`],
  ['a uuid with a traversal appended', `${WORKSPACE}/../${POST}`],
  ['a uuid missing its dashes', '11111111111141118111111111111111'],
  ['a uuid with a non-hex character', '1111111g-1111-4111-8111-111111111111'],
  ['a truncated uuid', '11111111-1111-4111-8111-11111111111'],
  ['an over-long uuid', '11111111-1111-4111-8111-1111111111111'],
  // The three below are all 36 characters drawn only from hex and `-`, so a guard
  // written as a loose character-class range would wave them through. They are
  // traversal-safe but not canonical, and a key must be one canonical string.
  ['a 36-character id with dashes in the wrong places', 'abcdef123456-4abc-8def-abcdef1234-56'],
  ['a 36-character run of hex with no dashes at all', 'abcdef1234567890abcdef1234567890abcd'],
  ['a 36-character string of nothing but dashes', '------------------------------------'],
]

const ID_FIELDS = ['workspaceId', 'postId', 'objectId'] as const

describe('mediaObjectPath — traversal safety', () => {
  for (const field of ID_FIELDS) {
    for (const [label, value] of REJECTED) {
      test(`refuses ${label} in ${field} instead of concatenating it into a path`, () => {
        expect(() => mediaObjectPath(args({ [field]: value }))).toThrow(MediaPathError)
      })
    }
  }

  test('names the offending field so a caller can tell which id was malformed', () => {
    for (const field of ID_FIELDS) {
      try {
        mediaObjectPath(args({ [field]: '..' }))
        expect.unreachable(`${field} should have thrown`)
      } catch (error) {
        expect(error).toBeInstanceOf(MediaPathError)
        expect((error as MediaPathError).field).toBe(field)
      }
    }
  })

  test('cannot be made to build a path that escapes the workspace prefix', () => {
    // The one property that matters: no combination of inputs yields a key whose
    // first segment is not the caller's workspace.
    const escapes = ['../other-workspace', '..%2fother', `${WORKSPACE}/..`, '....//', '..;', './..']
    for (const value of escapes) {
      expect(() => mediaObjectPath(args({ postId: value }))).toThrow(MediaPathError)
      expect(() => mediaObjectPath(args({ objectId: value }))).toThrow(MediaPathError)
      expect(() => mediaObjectPath(args({ workspaceId: value }))).toThrow(MediaPathError)
    }
  })

  test('refuses a non-string id as a MediaPathError, not a TypeError off `.length`', () => {
    // Types do not survive a request boundary: these arrive as JSON from a form
    // action, and `null.length` would throw a TypeError that no caller catches as
    // a MediaPathError — it would surface as a 500 with a stack instead of a
    // refusal naming the field. The `typeof` guard in normaliseId is the only
    // thing standing between the two, and nothing pinned it before.
    const notStrings: readonly unknown[] = [
      null,
      undefined,
      42,
      true,
      {},
      [],
      // Objects that stringify to a valid uuid must NOT be coerced into one.
      { toString: () => WORKSPACE },
      [WORKSPACE],
      new String(WORKSPACE),
    ]
    for (const field of ID_FIELDS) {
      for (const value of notStrings) {
        let caught: unknown
        try {
          mediaObjectPath(args({ [field]: value as string }))
        } catch (error) {
          caught = error
        }
        expect(caught).toBeInstanceOf(MediaPathError)
        expect((caught as MediaPathError).field).toBe(field)
        expect((caught as Error).message).not.toMatch(/[\r\n]/)
      }
    }
  })

  test('refuses a non-string mime as a MediaPathError rather than coercing it', () => {
    for (const value of [null, undefined, 42, {}, [], ['image/png']]) {
      let caught: unknown
      try {
        mediaObjectPath(args({ mime: value as string }))
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(MediaPathError)
      expect((caught as MediaPathError).field).toBe('mime')
    }
  })

  test('checks the ids before the mime, so a malformed id is reported even with a bad mime', () => {
    try {
      mediaObjectPath({ workspaceId: '..', postId: POST, objectId: OBJECT, mime: 'video/mp4' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as MediaPathError).field).toBe('workspaceId')
    }
  })
})

describe('mediaObjectPath — unknown mime', () => {
  test('throws rather than inventing an extension for a type no channel accepts', () => {
    expect(() => mediaObjectPath(args({ mime: 'video/mp4' }))).toThrow(MediaPathError)
  })

  test('throws rather than building an extensionless path for an empty mime', () => {
    // Silently returning `<w>/<p>/<o>.` or `<w>/<p>/<o>` would store the bytes under
    // a key whose type nothing can later recover.
    expect(() => mediaObjectPath(args({ mime: '' }))).toThrow(MediaPathError)
  })

  test('reports the mime field so the caller can map it to the right message', () => {
    try {
      mediaObjectPath(args({ mime: 'image/svg+xml' }))
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as MediaPathError).field).toBe('mime')
    }
  })
})

describe('mediaObjectPath — never leaks internals', () => {
  const POISON = '../../other-tenant/secret-\n-value-%2e%2e'

  test('never echoes the rejected value back in the error message', () => {
    // The message is logged, and on a bad day surfaces near the UI. Reflecting the
    // raw input would carry an attacker-chosen string — including newlines, which
    // forge log lines — straight through.
    for (const field of ID_FIELDS) {
      try {
        mediaObjectPath(args({ [field]: POISON }))
        expect.unreachable('should have thrown')
      } catch (error) {
        const message = (error as Error).message
        expect(message).not.toContain(POISON)
        expect(message).not.toContain('other-tenant')
        expect(message).not.toContain('secret')
      }
    }
  })

  test('never echoes a rejected mime back in the error message', () => {
    try {
      mediaObjectPath(args({ mime: 'video/x-\n-injected' }))
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as Error).message).not.toContain('injected')
    }
  })

  test('keeps every message on a single line so it cannot forge a log entry', () => {
    for (const [, value] of REJECTED) {
      try {
        mediaObjectPath(args({ workspaceId: value }))
        expect.unreachable('should have thrown')
      } catch (error) {
        expect((error as Error).message).not.toMatch(/[\r\n]/)
      }
    }
  })

  test('explains what is wrong without naming the storage bucket or the RLS policy', () => {
    try {
      mediaObjectPath(args({ workspaceId: 'not-a-uuid' }))
      expect.unreachable('should have thrown')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toMatch(/workspaceid/i)
      expect(message).not.toMatch(/storage\.objects|member_workspace_ids|bucket/i)
    }
  })
})

describe('mediaObjectPath — structural property over all accepted inputs', () => {
  const IDS = [
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
    '0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
    'AbCdEf12-3456-4aBc-8DeF-abcDEF123456',
    WORKSPACE,
    POST,
    OBJECT,
  ]

  test('no accepted input produces a path that is absolute, escaping, or oddly encoded', () => {
    for (const workspaceId of IDS) {
      for (const postId of IDS) {
        for (const objectId of IDS) {
          for (const [mime, ext] of ALLOWED) {
            const path = mediaObjectPath({ workspaceId, postId, objectId, mime })
            expect(path.startsWith('/')).toBe(false)
            expect(path).not.toContain('..')
            expect(path).not.toContain('//')
            expect(path).not.toContain('\\')
            expect(path).not.toContain('%')
            expect(path).not.toMatch(/\s/)
            expect(path.split('/')).toHaveLength(3)
            expect(path.split('/')[0]).toBe(workspaceId.toLowerCase())
            expect(path.endsWith(`.${ext}`)).toBe(true)
            expect(path).toBe(path.toLowerCase())
          }
        }
      }
    }
  })

  test('is deterministic — the same inputs always give the same key', () => {
    expect(mediaObjectPath(args())).toBe(mediaObjectPath(args()))
  })
})

describe('mediaObjectPath — accepted limitations, pinned deliberately', () => {
  test('accepts the nil uuid, leaving RLS to refuse it', () => {
    // The nil uuid is syntactically a uuid and is traversal-safe, so this function
    // has no reason to reject it. It matches no row in app.member_workspace_ids(),
    // so the upload fails at the database. Pinned so that tightening this is a
    // deliberate change, not an accident.
    const nil = '00000000-0000-0000-0000-000000000000'
    expect(mediaObjectPath(args({ workspaceId: nil }))).toBe(`${nil}/${POST}/${OBJECT}.png`)
  })

  test('accepts any uuid version, not only v4', () => {
    // Postgres does not constrain the version bits of a uuid column, so neither does
    // this. Version has no bearing on traversal safety.
    const v1 = 'c232ab00-9414-11ec-b3c8-9f6bdeced846'
    expect(mediaObjectPath(args({ postId: v1 }))).toBe(`${WORKSPACE}/${v1}/${OBJECT}.png`)
  })

  test('does not check that the post actually belongs to the workspace', () => {
    // This is a string builder, not an authorisation check. Pairing a real post with
    // the wrong workspace yields a well-formed key that RLS then refuses. Callers
    // must still load the post under the caller's workspace before uploading.
    const otherWorkspace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    expect(mediaObjectPath(args({ workspaceId: otherWorkspace }))).toBe(
      `${otherWorkspace}/${POST}/${OBJECT}.png`,
    )
  })
})
