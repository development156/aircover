import { Globe } from 'lucide-react'
import { normalizeDraft, renderBundle } from '@sahoda/sites'

import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { PageTitle } from '@/components/page-title'
import { GenerateSitePanel } from '@/components/sites/generate-site-panel'
import { SitePreview } from '@/components/sites/site-preview'
import { siteTreeToOutput } from '@/lib/sites/from-rows'
import { toPreviewPages, type PreviewPage } from '@/lib/sites/preview'
import { activeThemeTokens } from '@/lib/brand/read-theme'
import { checkCountableLimit } from '@/lib/billing/entitlements'
import { countSites, readRecentSites, readSiteTree } from '@/lib/sites/read'
import { getActiveWorkspace } from '@/lib/workspaces'
import { renderPreviewSafely } from '@/lib/sites/safe-preview'
import { sharedTokensCss } from '@/lib/sites/tokens-css'

export const metadata = { title: 'Sites' }

/**
 * Sites — generate + IN-APP PREVIEW. The rows round-trip through the same
 * `@sahoda/sites` pipeline that wrote them (`siteTreeToOutput → normalizeDraft
 * → renderBundle`), so preview markup re-earns every escaping/path guard on
 * every render. The preview wears the workspace's accepted Brand Skin
 * (`activeThemeTokens`); `null` there means no logo was ever uploaded and
 * `themeCss` falls back to the tokens.css defaults. `formAction: null` renders
 * the contact section formless (no lead route is mounted, and a form that
 * discards leads is worse than none).
 *
 * The DEPLOY half stays deferred and unowned: no Cloudflare client exists,
 * `sites.status` never leaves 'draft' from here, and every copy string says
 * "preview". A published-looking state without a real address would be the
 * fabricated success the honesty rule forbids.
 */

type Preview =
  { siteName: string; pages: PreviewPage[] } | 'unreadable' | 'read-failed' | 'no-workspace' | null

/**
 * Walks the recent sites (newest first) until one renders. A newest row with
 * zero pages — the mid-way-cleanup-failed orphan — must not shadow the older,
 * healthy, paid site beneath it (review HIGH). 'read-failed' is kept distinct
 * from both 'no sites' and 'unreadable': each earns different copy, and only
 * one of them may honestly suggest generating.
 */
async function buildPreview(): Promise<Preview> {
  const read = await readRecentSites()
  // FOUR answers, not three. "No workspace yet" used to arrive as 'read-failed'
  // and render "reload before generating — you may already have a site, and
  // generating again costs credits": a failure that had not happened, a site that
  // cannot exist, and a charge against a wallet that does not exist either.
  if (read.status === 'no-workspace') return 'no-workspace'
  if (read.status === 'unreadable') return 'read-failed'
  const sites = read.sites
  if (sites.length === 0) return null

  // The workspace's accepted Brand Skin. `null` when no logo was ever uploaded,
  // which `themeCss` renders as the tokens.css defaults.
  const theme = await activeThemeTokens()

  for (const site of sites) {
    const tree = await readSiteTree(site.id)
    if (!tree || tree.pages.length === 0) continue

    const output = siteTreeToOutput(tree.pages, tree.sections)
    if (!output) continue

    const normalized = normalizeDraft(output, {
      name: site.name,
      goal: site.goal,
      maxPages: 5,
      traceId: `preview-${site.id}`,
    })
    if (!normalized.ok || normalized.data.draft.pages.length === 0) continue

    // `renderBundle` throws by design on an unsafe stylesheet and
    // `sharedTokensCss` reads from disk — a throw here used to 500 the whole
    // page for a site the founder had already paid 100 credits for.
    const preview = renderPreviewSafely(site.id, () => {
      const bundle = renderBundle(normalized.data.draft, {
        siteName: site.name,
        tokensCss: sharedTokensCss(),
        theme,
        formAction: null,
        canonicalOrigin: null,
      })
      return { siteName: site.name, pages: toPreviewPages(bundle) }
    })
    if (preview === null) continue

    return preview
  }

  return 'unreadable'
}

/**
 * The plan sentence to show BEFORE the click, or null when this workspace may
 * generate. Null for every "we could not tell" case as well — an unreadable
 * workspace, an unreadable count, or an unreachable plan resolver. The server
 * action fails closed on all three, so nothing is admitted by this returning null;
 * what it avoids is asserting a limit we did not actually read.
 */
async function siteLimitNotice(): Promise<string | null> {
  const workspace = await getActiveWorkspace()
  if (!workspace) return null

  const count = await countSites(workspace.id)
  if (count === null) return null

  const limit = await checkCountableLimit(workspace.id, 'sites', count)
  return limit.kind === 'blocked' ? limit.sentence : null
}

export default async function SitesPage() {
  const [preview, limitNotice] = await Promise.all([buildPreview(), siteLimitNotice()])

  return (
    <div className="space-y-grid">
      <PageTitle>Sites</PageTitle>

      {/* The spend panel is withheld ONLY when there is nothing to spend from.
          Everywhere else it stays: a read hiccup must not remove the control the
          page exists for. */}
      {preview === 'no-workspace' ? null : <GenerateSitePanel limitNotice={limitNotice} />}

      {preview === 'no-workspace' ? (
        <EmptyState
          icon={Globe}
          title="Create a workspace to build a site"
          body="Sites belong to a workspace and you don't have one yet. Nothing failed — and nothing has been charged."
          action={<CreateWorkspaceButton variant="primary" />}
        />
      ) : preview === null ? (
        <EmptyState
          icon={Globe}
          title="Your site shows up here"
          body="Generate a one-page draft above and preview it right here. Publishing to a real address is still being built."
          // Stated, not instructed. MEASURED 2026-08-22: this tip renders whenever no
          // site exists, with no reference to brain state, so a workspace with a fully
          // resolved Brand Brain was still told to go and resolve one. The causal fact
          // it exists to convey — the site inherits the brain's voice — is true either
          // way, and saying it that way cannot be wrong for anybody.
          tip="The site is written in your Brand Brain's voice, so it will sound like whatever that holds today."
        />
      ) : preview === 'read-failed' ? (
        <p className="rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
          Couldn&rsquo;t check your sites just now — reload before generating. You may already have
          a site, and generating again costs credits.
        </p>
      ) : preview === 'unreadable' ? (
        <p className="rounded-input bg-danger-bg px-3 py-2.5 text-[13px] text-danger">
          Your recent site drafts could not be read back. Reload first; if this persists, generate
          again — you were only ever charged for drafts that saved.
        </p>
      ) : (
        <SitePreview siteName={preview.siteName} pages={preview.pages} />
      )}
    </div>
  )
}
