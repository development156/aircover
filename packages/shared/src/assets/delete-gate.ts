import type { PostStatus, VariantPublishStatus } from '../enums'

/**
 * May this library file be deleted, and if not, WHERE is it being used?
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `asset_usages` cascades when an asset is deleted. So the naive delete
 * SUCCEEDS: the file goes, the usage records go with it, and a post that is
 * scheduled to go out on Thursday loses its photo silently. Nobody is told, and
 * nothing in the database remembers that there was ever anything to tell. That
 * is a data-loss path, and it is the reason a library needs a "used in" read
 * before it is allowed a delete button.
 *
 * ── WHY IT IS A PURE FUNCTION ────────────────────────────────────────────────
 * The same decision has to be made in three places: the server action (so the
 * person gets a sentence), the database trigger (so a second caller cannot walk
 * past it), and the tests. A pure function is the only one of those three that
 * can be exhaustively tested against every `PostStatus` — and `every` is the
 * word that matters, because a gate written against a remembered list of
 * statuses is a gate with a hole in it the day a status is added.
 *
 * The DB trigger restates this rule in SQL rather than calling it — those are
 * two languages, so the only defence against drift is a test that runs the two
 * against the same table of statuses. `packages/db/tests/asset_delete_gate`
 * does that.
 *
 * ── WHAT LOCKS AND WHAT MERELY WARNS ─────────────────────────────────────────
 * LOCKED   — the post will go out, is going out, or has gone out. Deleting the
 *            file either breaks a publish that is already committed or destroys
 *            the record of something that is live. Refused outright.
 * DETACH   — the post is still being written. The file can go, but the person is
 *            told which posts lose it first and has to say yes.
 *
 * `approved` deliberately does NOT lock. Approving a post is not scheduling it
 * (docs/26 §3.3 makes the same distinction structurally), nothing is queued, and
 * an approved post whose photo is removed is a post someone can still fix. It
 * warns like any other unpublished post.
 *
 * Pure: no I/O, no clock, no database.
 */

/**
 * Post lifecycle states in which an attached file may not be deleted.
 *
 * `partial` is included and is the easiest one to miss: it means live on at
 * least one channel already. `failed` and `expired` are not — nothing went out
 * and nothing is queued, so the file is free.
 */
export const LOCKING_POST_STATUSES: readonly PostStatus[] = Object.freeze([
  'scheduled',
  'publishing',
  'published',
  'partial',
])

/**
 * Per-channel states that lock, read from `post_variants.publish_status`.
 *
 * Checked IN ADDITION to the post's own status, not instead of it. The two can
 * legitimately disagree while a publish is in flight — the dispatcher moves
 * variants before it settles the post — and a gate that trusted only the parent
 * row would open for exactly the seconds during which the file is being read.
 */
export const LOCKING_VARIANT_STATUSES: readonly VariantPublishStatus[] = Object.freeze([
  'scheduled',
  'publishing',
  'published',
])

/** One post that uses the file. */
export interface AssetUsageSite {
  postId: string
  /** `posts.title` is nullable. null is carried through, never replaced with a guess. */
  postTitle: string | null
  postStatus: PostStatus
  /** Every `post_variants.publish_status` on that post. Empty is normal. */
  variantStatuses: readonly VariantPublishStatus[]
}

export type AssetDeleteDecision =
  | {
      ok: true
      /** Attachments that come off if the person confirms. Possibly empty. */
      detach: AssetUsageSite[]
      /** Present when `detach` is non-empty: the sentence that asks for consent. */
      message: string | null
    }
  | {
      ok: false
      /** Why it is refused, named. Never empty when `ok` is false. */
      locked: AssetUsageSite[]
      /** Sites that would have merely detached. Reported so the count adds up. */
      detach: AssetUsageSite[]
      message: string
    }

const LOCKING_POSTS: ReadonlySet<string> = new Set(LOCKING_POST_STATUSES)
const LOCKING_VARIANTS: ReadonlySet<string> = new Set(LOCKING_VARIANT_STATUSES)

/**
 * How a post is referred to in a refusal.
 *
 * An untitled post is described as untitled. It is NOT given its id — an id is
 * not a name, and printing one tells the reader to go and look for something
 * they have never seen. It is not given an invented title either.
 */
export function nameOfPost(site: AssetUsageSite): string {
  const title = typeof site.postTitle === 'string' ? site.postTitle.trim() : ''
  if (title === '') return 'an untitled post'
  return `“${title}”`
}

/** Is this post's state one in which the file must not be removed? */
export function isLockedSite(site: AssetUsageSite): boolean {
  if (LOCKING_POSTS.has(site.postStatus)) return true
  const variants = Array.isArray(site.variantStatuses) ? site.variantStatuses : []
  return variants.some((status) => LOCKING_VARIANTS.has(status))
}

/** Why one site locks, in the reader's words — not the column's. */
export function reasonForLock(site: AssetUsageSite): string {
  if (site.postStatus === 'published' || site.postStatus === 'partial') return 'already published'
  if (site.postStatus === 'publishing') return 'publishing right now'
  if (site.postStatus === 'scheduled') return 'scheduled to go out'
  // The post row does not lock, so a variant does. Reported as what it is rather
  // than as the post's status, which would read as the wrong fact about the post.
  const variants = Array.isArray(site.variantStatuses) ? site.variantStatuses : []
  if (variants.includes('published')) return 'already published on a channel'
  if (variants.includes('publishing')) return 'publishing on a channel right now'
  return 'scheduled on a channel'
}

/** At most this many posts are named before the rest are counted. */
const MAX_NAMED = 3

function listNames(sites: readonly AssetUsageSite[]): string {
  const named = sites
    .slice(0, MAX_NAMED)
    .map((site) => `${nameOfPost(site)} (${reasonForLock(site)})`)
  const hidden = sites.length - named.length
  if (hidden > 0) {
    named.push(hidden === 1 ? '1 more post' : `${hidden} more posts`)
  }
  if (named.length === 1) return named[0] as string
  const last = named[named.length - 1] as string
  return `${named.slice(0, -1).join(', ')} and ${last}`
}

function listPlainNames(sites: readonly AssetUsageSite[]): string {
  const named = sites.slice(0, MAX_NAMED).map(nameOfPost)
  const hidden = sites.length - named.length
  if (hidden > 0) {
    named.push(hidden === 1 ? '1 more post' : `${hidden} more posts`)
  }
  if (named.length === 1) return named[0] as string
  const last = named[named.length - 1] as string
  return `${named.slice(0, -1).join(', ')} and ${last}`
}

/**
 * Decide whether a library file may be deleted, given every post that uses it.
 *
 * An empty list is the ordinary "nothing uses this" case and returns `ok: true`
 * with nothing to detach — never a refusal, and never a warning about zero
 * posts.
 */
export function decideAssetDelete(sites: readonly AssetUsageSite[]): AssetDeleteDecision {
  const all = Array.isArray(sites) ? sites : []
  const locked = all.filter(isLockedSite)
  const detach = all.filter((site) => !isLockedSite(site))

  if (locked.length > 0) {
    const count = locked.length === 1 ? 'a post that' : `${locked.length} posts that`
    return {
      ok: false,
      locked,
      detach,
      message: `This file is used by ${count} cannot lose it: ${listNames(locked)}. Remove it from ${locked.length === 1 ? 'that post' : 'those posts'} first, or keep the file.`,
    }
  }

  if (detach.length === 0) return { ok: true, detach: [], message: null }

  const count = detach.length === 1 ? '1 post' : `${detach.length} posts`
  return {
    ok: true,
    detach,
    message: `Deleting this file removes it from ${count}: ${listPlainNames(detach)}. ${detach.length === 1 ? 'That post keeps' : 'Those posts keep'} everything else.`,
  }
}
