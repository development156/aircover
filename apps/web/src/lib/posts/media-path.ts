/**
 * Storage keys for uploaded post media.
 *
 * The RLS policy on `storage.objects` reads the FIRST path segment and nothing
 * else:
 *
 *   nullif((storage.foldername(name))[1], '')::uuid
 *     in (select app.member_workspace_ids())
 *
 * So the workspace uuid leading the key is the whole tenant boundary for the
 * `media` bucket. A key that lands under any other prefix is either a refused
 * upload (the benign failure) or, if the prefix happened to be another
 * workspace's, a cross-tenant write. This module is the single place that key is
 * built, and it re-validates its inputs rather than trusting its callers.
 *
 * The ids do come from the server — the session's workspace, a post loaded under
 * that workspace, and a `randomUUID()` minted here — but "the caller is careful"
 * is not a property a reader can check. The guard below is: every id must be a
 * canonical uuid, whose character set is hex and `-`. Traversal is therefore not
 * blocked by a denylist of `..` and `/` — those characters cannot occur in an
 * accepted id at all, so no escaping sequence, encoded or otherwise, can be
 * expressed. That is why this is an allowlist and not a sanitiser.
 *
 * Pure: no I/O, no clock, no randomness. The caller supplies `objectId`.
 */

/** Which input a `MediaPathError` is about, so callers branch without parsing prose. */
export type MediaPathField = 'workspaceId' | 'postId' | 'objectId' | 'assetId' | 'mime'

/**
 * Refusal to build a key. Thrown, not returned, because every caller has already
 * sniffed the bytes and loaded the post: reaching this is a bug upstream, not a
 * user mistake, and a `string` return leaves nowhere to put the failure.
 *
 * `message` never interpolates the offending value. It is logged, and a rejected
 * id is by definition attacker-shaped — echoing it would carry chosen text, and
 * chosen newlines, into the log and any surface that renders it.
 */
export class MediaPathError extends Error {
  readonly field: MediaPathField

  constructor(field: MediaPathField, message: string) {
    super(message)
    this.name = 'MediaPathError'
    this.field = field
  }
}

/**
 * Canonical 8-4-4-4-12 hex. Case-insensitivity is handled by lowercasing first,
 * not by adding `A-F` here, so the pattern also proves the normalised form.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const UUID_LENGTH = 36

/**
 * The four image types the channel specs draw from, mapped to the extension the
 * key carries. Kept as a `Map`, not an object literal, so a lookup of
 * `constructor` or `toString` misses instead of returning something off
 * `Object.prototype` — with an object literal both are truthy and neither is an
 * extension.
 *
 * Matching is exact: no trimming, no case folding, no stripping of `; charset=`.
 * `validateMedia` tests `spec.mediaTypes.includes(media.mime)`, an exact compare,
 * so anything looser here would mint a key for a file the Constraint Engine then
 * rejects with MEDIA_TYPE. The two must accept the same set or neither is
 * trustworthy — in BOTH directions. A type missing here refuses an upload the
 * specs allow; a type only here mints a key for a file every spec rejects.
 * `media-path.test.ts` asserts that set equality against CONSTRAINTS using the
 * exported `ALLOWED_MEDIA_TYPES` below, so the assertion reads this table rather
 * than a hand-written copy of it.
 */
const EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

/**
 * Exactly the mime types this module will build a key for — the keys of the
 * table above, not a second list that could drift from it.
 *
 * Exported so the lockstep test can compare THIS table against the union of
 * `CONSTRAINTS[*].mediaTypes` in both directions. Also the honest source for an
 * upload input's `accept` attribute.
 */
export const ALLOWED_MEDIA_TYPES: readonly string[] = [...EXTENSIONS.keys()]

/** The extension for an allowed image type, or `null` for anything else. */
export function extensionForMime(mime: string): string | null {
  return EXTENSIONS.get(mime) ?? null
}

/**
 * Return `value` lowercased once proven to be a canonical uuid, else throw.
 *
 * The explicit length check is deliberate belt-and-braces. JavaScript's `$` is
 * end-of-input, so `UUID_PATTERN` already refuses a trailing newline — but that
 * is a language subtlety a future port or a stray `m` flag would silently undo,
 * and "id with a newline glued on" is exactly the shape that smuggles a second
 * path component past a naive check.
 */
function normaliseId(value: string, field: MediaPathField): string {
  // Types do not survive a request boundary; a non-string must fail as a
  // MediaPathError rather than as a TypeError on `.length`.
  if (typeof value !== 'string' || value.length !== UUID_LENGTH) {
    throw new MediaPathError(field, `Cannot build a media path: ${field} is not a uuid.`)
  }

  const normalised = value.toLowerCase()
  if (!UUID_PATTERN.test(normalised)) {
    throw new MediaPathError(field, `Cannot build a media path: ${field} is not a uuid.`)
  }

  return normalised
}

/**
 * Build the `media` bucket key for one uploaded file:
 * `<workspaceId>/<postId>/<objectId>.<ext>`.
 *
 * Ids are lowercased. Postgres casts the first segment to `uuid`, which is
 * case-insensitive, so an uppercase id would pass RLS at a second, distinct
 * storage key for the same workspace — one object, two addresses. Normalising
 * means a key is a function of its inputs and nothing else.
 *
 * Throws `MediaPathError` if any id is not a canonical uuid, or if `mime` is not
 * one of the four allowed image types. It never falls back to an invented or
 * absent extension: a key whose type cannot later be recovered is worse than a
 * refused upload.
 */
export function mediaObjectPath(input: {
  workspaceId: string
  postId: string
  /** Opaque unique id for this object — the CALLER generates it (randomUUID on the server). */
  objectId: string
  mime: string
}): string {
  // Ids first: a malformed id is the security-relevant failure, and reporting it
  // ahead of an unsupported mime keeps that signal from being masked.
  const workspaceId = normaliseId(input.workspaceId, 'workspaceId')
  const postId = normaliseId(input.postId, 'postId')
  const objectId = normaliseId(input.objectId, 'objectId')

  const extension = extensionForMime(input.mime)
  if (extension === null) {
    throw new MediaPathError(
      'mime',
      'Cannot build a media path: mime is not an allowed image type.',
    )
  }

  return `${workspaceId}/${postId}/${objectId}.${extension}`
}

/**
 * The folder library files live under, inside a workspace's prefix.
 *
 * `<workspaceId>/assets/<assetId>.<ext>` cannot collide with a post's
 * `<workspaceId>/<postId>/<objectId>.<ext>`, because the second segment there is
 * always a uuid and `assets` is not one. That is a property of the ALLOWLIST
 * above rather than a coincidence: no accepted id can spell this word.
 */
const ASSET_FOLDER = 'assets'

/**
 * Build the `media` bucket key for one LIBRARY file:
 * `<workspaceId>/assets/<assetId>.<ext>`.
 *
 * A library file belongs to the workspace, not to a post, so it has no post id
 * to sit under — which is why this is a sibling of `mediaObjectPath` rather than
 * a widening of it. Everything that matters is identical: the first segment is
 * still the workspace uuid, which is the WHOLE tenant boundary the storage
 * policy reads, and every id still has to be a canonical uuid before it reaches
 * the string.
 *
 * Throws `MediaPathError` on a malformed id or an unsupported mime, for the same
 * reasons `mediaObjectPath` does.
 */
export function assetObjectPath(input: {
  workspaceId: string
  /** The `assets` row id. The CALLER mints it, so the row and the object agree. */
  assetId: string
  mime: string
}): string {
  const workspaceId = normaliseId(input.workspaceId, 'workspaceId')
  const assetId = normaliseId(input.assetId, 'assetId')

  const extension = extensionForMime(input.mime)
  if (extension === null) {
    throw new MediaPathError(
      'mime',
      'Cannot build a media path: mime is not an allowed image type.',
    )
  }

  return `${workspaceId}/${ASSET_FOLDER}/${assetId}.${extension}`
}
