import { z } from 'zod'
import type { Result } from '@sahoda/shared'
import { checkHonesty, withProtoKeyRejected, type HonestyRule } from './schema-guards'

/**
 * The deploy seam. `packages/sites` produces bytes and hands them to a {@link Deployer};
 * it never calls the network itself. Two implementations exist: the honest local
 * `fixtureDeployer` (default) and `cloudflareDeployer` (Workers for Platforms).
 */

/** One emitted file. `path` is bundle-relative — no leading slash required, never absolute. */
export interface BundleFile {
  path: string
  content: string
  contentType: string
}

/** The full static site. `bundleId` is a content hash produced by `renderBundle`. */
export interface SiteBundle {
  files: BundleFile[]
  bundleId: string
}

/**
 * TSD §8 promises "keep the last 5 bundles". `site_deployments` does not exist, so the
 * history lives inline in `sites.deploy`. The FIELD is built so rollback is not
 * schema-blocked later; rollback ITSELF is out of scope for Roadmap item 12.
 */
export const DEPLOY_HISTORY_LIMIT = 5

/**
 * A persisted `url` is a value a later task will render into an anchor. `safeUrl` in
 * `render/escape.ts` remains the last line of defence, but a `javascript:` scheme has no
 * legitimate way to reach this column, so it is refused at the persistence boundary too.
 * `file://` is allowed because the honest local `fixtureDeployer` emits exactly that.
 */
export const MAX_URL_LENGTH = 2048
const LOCAL_URL_SCHEME = 'file://'
const ALLOWED_URL_SCHEMES = ['https://', 'http://', LOCAL_URL_SCHEME] as const

/**
 * The same discipline as {@link MAX_URL_LENGTH}, applied to EVERY other free string in this
 * jsonb column — `bundleId`, `scriptName`, `error.code`, `error.message` and the history
 * entry's `bundleId`. Bounding only `url` would have been a bound on one call site rather
 * than on the column: a provider that returns a megabyte of error text writes a megabyte
 * into `sites.deploy` just as effectively as a long url would have. 2048 is far above every
 * real value (a content hash is ~64 chars, a Worker script name ~63, a message a sentence)
 * and far below anything that makes a row expensive to read.
 */
export const MAX_TEXT_LENGTH = 2048

const DeployTextSchema = z.string().max(MAX_TEXT_LENGTH)

const DeployUrlSchema = z
  .string()
  .max(MAX_URL_LENGTH)
  .refine((value) => ALLOWED_URL_SCHEMES.some((scheme) => value.startsWith(scheme)), {
    message: 'url must use https, http or file — no other scheme may be persisted or rendered.',
  })

const isLocalUrl = (url: string): boolean => url.startsWith(LOCAL_URL_SCHEME)

/**
 * Timestamps are ISO-8601, enforced rather than trusted: both deployers derive them from an
 * injected clock via `toISOString()`, and a UI that renders `deployedAt` must never be handed
 * a string like `banana`. Enforcing the format is also what makes the field comparable, so
 * `appendHistory`'s newest-first ordering is a convenience for readers rather than the only
 * way to order the list.
 */
const DeployTimestampSchema = z.iso.datetime()

/**
 * `deployedAt` is REQUIRED here while {@link SiteDeployState.deployedAt} is nullable, and the
 * asymmetry is the contract: **history is success-only**. A failed deploy has no timestamp, so
 * it is structurally unable to enter `history` — the only way in is for a deployer to fabricate
 * a clock reading, which is exactly the mock-success this shape exists to make visible.
 */
export interface SiteDeployHistoryEntry {
  bundleId: string
  deployedAt: string
  url: string | null
  /** true ⇒ this was NOT a public URL. Required, so it cannot be forgotten. */
  preview: boolean
}

/**
 * A `file://` url is a path on one machine's disk; it is never something a visitor can open.
 * Labelling one `preview: false` is therefore a public-URL claim about a local file — the
 * exact "no fake links" failure the `preview` flag exists to make impossible. `preview: true`
 * stays legal for every scheme, because calling a real https deploy a preview understates
 * rather than overstates what the user has.
 */
const LOCAL_URL_MUST_BE_PREVIEW =
  'a file:// url is a local path, so preview: false would advertise it as a public address.'

const ENTRY_HONESTY_RULES: readonly HonestyRule<SiteDeployHistoryEntry>[] = [
  {
    path: 'preview',
    isViolated: (entry) => entry.url !== null && isLocalUrl(entry.url) && !entry.preview,
    message: LOCAL_URL_MUST_BE_PREVIEW,
  },
]

export const SiteDeployHistoryEntrySchema: z.ZodType<SiteDeployHistoryEntry> = withProtoKeyRejected(
  z
    .strictObject({
      bundleId: DeployTextSchema,
      deployedAt: DeployTimestampSchema,
      url: DeployUrlSchema.nullable(),
      preview: z.boolean(),
    })
    .superRefine(checkHonesty(ENTRY_HONESTY_RULES)),
)

/**
 * The shape of the untyped `sites.deploy` jsonb column. Nothing in the repo defined it,
 * so this design invents it — local to this package now, flagged for `@sahoda/shared`
 * promotion post-Alpha (the precedent wt-billing set with `PaymentProvider`).
 */
export interface SiteDeployState {
  deployer: 'fixture' | 'cloudflare'
  status: 'pending' | 'live' | 'failed'
  /** true ⇒ NOT a public URL. The honest-labeling mechanism for the whole feature. */
  preview: boolean
  /** null unless genuinely reachable. Never a plausible-looking guess. */
  url: string | null
  bundleId: string
  scriptName: string | null
  deployedAt: string | null
  error: { code: string; message: string } | null
  history: SiteDeployHistoryEntry[]
}

/**
 * `strictObject`, not `object`: `z.object` strips unknown keys silently, and Task 17 reads this
 * column, modifies it and writes it back. A key written by another writer — or by a newer build
 * of this package — would be dropped on that round-trip with nothing surfaced to the caller,
 * which is the silent-loss defect the house rules forbid. Loud rejection is the honest failure
 * mode. **Adding a field therefore means updating this schema in the same change, before any
 * code writes it.** `strictObject` alone cannot keep that promise for `__proto__`, so
 * {@link withProtoKeyRejected} closes the one hole it has.
 */

/**
 * `status` is a CLAIM and the other three fields are the evidence for it, so they must agree
 * or the row is a lie this schema blessed. Each rule is a BICONDITIONAL rather than a
 * one-directional check, because both halves are dishonest in their own way:
 *
 * - `{status:'failed', error:null}` reports a failure nobody can explain; `{status:'live',
 *   error:{…}}` files a complaint about a deploy that worked.
 * - `{status:'pending', url:'https://…'}` advertises a live address for a deploy that has not
 *   happened; `{status:'live', url:null}` claims something is serving with nothing to open —
 *   the lie `fixture.ts` already refuses to construct, now unrepresentable rather than merely
 *   avoided.
 * - `deployedAt` records when the site WENT LIVE (both deployers stamp it at success), so a
 *   pending or failed deploy having one is a fabricated clock reading, and a live one lacking
 *   one hides when it happened. This is the same success-only rule
 *   {@link SiteDeployHistoryEntry} enforces structurally, applied to the state.
 */
const STATE_HONESTY_RULES: readonly HonestyRule<SiteDeployState>[] = [
  {
    path: 'url',
    isViolated: (state) => (state.url !== null) !== (state.status === 'live'),
    message:
      "url must be present when status is 'live' and null otherwise — only a live deploy has a reachable address.",
  },
  {
    path: 'deployedAt',
    isViolated: (state) => (state.deployedAt !== null) !== (state.status === 'live'),
    message:
      "deployedAt must be present when status is 'live' and null otherwise — it records when the site went live, not when a deploy was attempted.",
  },
  {
    path: 'error',
    isViolated: (state) => (state.error !== null) !== (state.status === 'failed'),
    message:
      "error must be present when status is 'failed' and null otherwise — an unexplained failure is not a failure report.",
  },
  {
    path: 'preview',
    isViolated: (state) => state.url !== null && isLocalUrl(state.url) && !state.preview,
    message: LOCAL_URL_MUST_BE_PREVIEW,
  },
]

export const SiteDeployStateSchema: z.ZodType<SiteDeployState> = withProtoKeyRejected(
  z
    .strictObject({
      deployer: z.enum(['fixture', 'cloudflare']),
      status: z.enum(['pending', 'live', 'failed']),
      preview: z.boolean(),
      url: DeployUrlSchema.nullable(),
      bundleId: DeployTextSchema,
      scriptName: DeployTextSchema.nullable(),
      deployedAt: DeployTimestampSchema.nullable(),
      error: withProtoKeyRejected(
        z.strictObject({ code: DeployTextSchema, message: DeployTextSchema }),
      ).nullable(),
      history: z.array(SiteDeployHistoryEntrySchema).max(DEPLOY_HISTORY_LIMIT),
    })
    .superRefine(checkHonesty(STATE_HONESTY_RULES)),
)

/**
 * Prepend the newest deploy and evict the oldest beyond the cap. Newest-first ordering
 * means readers never have to sort by `deployedAt`. Callers may only reach this with a
 * SUCCESSFUL deploy: {@link SiteDeployHistoryEntry} requires a timestamp, and a failed
 * deploy has none to give.
 */
export const appendHistory = (
  previous: SiteDeployHistoryEntry[],
  entry: SiteDeployHistoryEntry,
): SiteDeployHistoryEntry[] => [entry, ...previous].slice(0, DEPLOY_HISTORY_LIMIT)

export interface DeployContext {
  workspaceId: string
  siteId: string
  slug: string
  /** Injected config (`NEXT_PUBLIC_SITE_DOMAIN`), NEVER hardcoded — a wrong domain must
   *  not be able to produce a plausible URL from inside this package. */
  baseDomain: string | null
  traceId: string
  previous: SiteDeployHistoryEntry[]
  /** Injected clock; overrides a deployer's own default so tests are deterministic. */
  now?: () => Date
}

export type Deployer = (bundle: SiteBundle, ctx: DeployContext) => Promise<Result<SiteDeployState>>
