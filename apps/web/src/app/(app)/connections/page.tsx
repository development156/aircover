import { Link2 } from 'lucide-react'
import type { Connection, ConnectionPlatform } from '@sahoda/shared'

import { ChannelTile } from '@/components/connections/channel-tile'
import {
  ConnectionMarketplace,
  type MarketplaceSection,
} from '@/components/connections/connection-marketplace'
import { ConnectionHealthBanner } from '@/components/connections/connection-health-banner'
import { ConnectOutcomeNotice } from '@/components/connections/connect-outcome-notice'
import type { XRationMeterProps } from '@/components/connections/x-ration-meter'
import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { PageTitle } from '@/components/page-title'
import { checkCountableLimit } from '@/lib/billing/entitlements'
import { CONNECTABLE, PLANNED } from '@/lib/connections/catalogue'
import { readConnections, readConnectionSlots } from '@/lib/connections/read'
import { readXUsage } from '@/lib/connections/x-usage'
import { getActiveWorkspace } from '@/lib/workspaces'
import { zernioAvailable } from '@/lib/zernio/server'
import { X_MONTHLY_RATION } from '@sahoda/publishing'

export const metadata = { title: 'Connections' }

/**
 * CONNECTIONS — the second screen every new user reaches.
 *
 * ── WHAT THIS SCREEN IS FOR ──────────────────────────────────────────────────
 * One question: **which of my channels will actually carry a post, and what will
 * it cost me.** Everything here is arranged to answer that in the order a person
 * asks it — what just happened, what is broken, what can I connect, what is
 * coming.
 *
 * ── THE TWO GROUPS, AND WHY THEY REPLACED SOCIAL / LOCAL LISTINGS ────────────
 * The old grouping was Social (3 channels) and Local listings (1), each rendered
 * as its own grid. `docs/27_Design_Audit.md` §3.4 measured the result: "two rows
 * of cards, then ~400px of dead space. `Local listings 0/1` puts one card in a
 * four-column grid." A group of one is not a group; it is a heading with a
 * paperweight under it.
 *
 * The grouping is now **by readiness**, which is both the honest cut and an even
 * one — four connectable channels, four that are named and unbuilt. The question
 * the old grouping answered ("why is Google Business Profile in with Instagram?")
 * is answered better on the tile itself, where each channel states its `kind`
 * — *Feed*, *Local listing*, *Short video*, *Broadcast* — beside its own name,
 * rather than by a heading the reader has to scroll back to.
 *
 * ── THE BROWSE LAYER, AND WHY IT DID NOT REPLACE THE GROUPING ────────────────
 * A category rail and a search field sit above the same two groups
 * (`ConnectionMarketplace`). The rail filters by the catalogue's own `kind` and
 * counts every facet from the entries rather than storing a number, so a fifth
 * channel appears in the sidebar the day its catalogue row lands and nothing here
 * has to be told about it.
 *
 * It is a FILTER and not a set of headings, which is the §3.4 lesson above
 * applied rather than forgotten: four of the five kinds hold exactly one channel,
 * so heading by kind would put four paperweights on the page. Filtering down to
 * one card is a result a person asked for; a heading over one card is a layout
 * mistake.
 *
 * ── ONE PRIMARY PER VIEW, AND USUALLY ZERO ───────────────────────────────────
 * Run 17 found four full-width solid-orange primaries on this one screen. There
 * are now eight tiles, so the rule matters more, not less: every `ConnectButton`
 * is `secondary` (it argues its own case at its call site), and the accent is
 * spent in exactly one place — the health banner, when a connection is actually
 * broken. When nothing is broken this screen has **no** primary, which is correct:
 * §1.5 says one primary per view, not at least one.
 */

/**
 * Every connectable channel goes through Zernio. `x`, `gbp` and `linkedin` were
 * once disabled because their NATIVE flow needs a vault write that is still
 * unbuilt; routing them through Zernio removes that dependency entirely — Zernio
 * holds the credential, exactly as it does for instagram — so the buttons do what
 * they say.
 */
const LIVE_VIA_ZERNIO: ReadonlySet<string> = new Set<ConnectionPlatform>([
  'instagram',
  'x',
  'gbp',
  'linkedin',
])

/**
 * The plan sentence when this workspace has no room for another channel, else null.
 *
 * Read from the DATABASE, never from the query string — the same rule
 * `ConnectOutcomeNotice` follows when it refuses to render counts off the address
 * bar. Null on every "could not tell" case: the return route fails closed
 * regardless, so nothing is admitted by this being null; what it avoids is telling
 * someone their plan is full when the truth is we could not read it.
 */
async function channelLimitNotice(): Promise<string | null> {
  const workspace = await getActiveWorkspace()
  if (!workspace) return null

  const slots = await readConnectionSlots(workspace.id)
  if (slots === null) return null

  const verdict = await checkCountableLimit(workspace.id, 'channels', slots.count)
  return verdict.kind === 'blocked' ? verdict.sentence : null
}

/**
 * The X meter's props, or `undefined` when there is no workspace to count for.
 *
 * `no-workspace` renders nothing rather than an unreadable mark: there is no
 * question to have failed to answer, and a broken-rule glyph would claim a fault
 * where there is only an empty account.
 */
async function xRation(): Promise<XRationMeterProps | undefined> {
  const workspace = await getActiveWorkspace()
  const usage = await readXUsage(workspace?.id ?? null)
  if (usage.status === 'no-workspace') return undefined
  if (usage.status === 'unreadable') return { status: 'unreadable' }
  return {
    status: 'ok',
    used: usage.used,
    remaining: Math.max(0, X_MONTHLY_RATION - usage.used),
  }
}

export default async function ConnectionsPage({
  searchParams,
}: {
  /**
   * Written by `/api/oauth/zernio/return`. `reason` is deliberately NOT read here —
   * it exists for the log reader; the notice's words come from `zernio` alone,
   * matched against an allowlist. Everything in this URL came through the user's
   * browser, which is the same reason the return route refuses to read `accountId`
   * off it.
   */
  searchParams: Promise<{ zernio?: string | string[] }>
}) {
  const [connections, { zernio }, channelLimit, ration] = await Promise.all([
    readConnections(),
    searchParams,
    channelLimitNotice(),
    xRation(),
  ])
  const railReady = zernioAvailable()
  const planFull = channelLimit !== null

  // One lookup, so a channel appears exactly once whether or not it is linked.
  const rows = connections.status === 'ok' ? connections.connections : []
  // Keyed by STRING, not by `ConnectionPlatform`. A catalogue id is the wider
  // union, and casting it narrow at four call sites to satisfy the map would be
  // asserting the very thing `asChannel` exists to check. A planned channel
  // simply never matches a row, because the database cannot hold one.
  const byChannel = new Map<string, Connection>(rows.map((c) => [c.platform, c]))
  const live = CONNECTABLE.filter((entry) => byChannel.get(entry.id)?.status === 'active').length

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle sub="Connect your channels and manage where Sahoda publishes your content.">
          Connections
        </PageTitle>
        {/* ── THE COUNT, PROMOTED OUT OF THE GROUP HEADING ──────────────────
            It was `type-sm` grey text beside "Connect now", which put the one
            number answering "where do I stand" at the same weight as the lead
            line under it. Here it is the first thing read on the right.

            Rendered ONLY when the connections read succeeded. On `unreadable`
            this whole branch is not reached, so the card can never print "0 of
            4 connected" off a failed read — which would be a reading of the
            customer's account drawn from a query that never answered. */}
        {connections.status === 'ok' ? (
          <div className="surface-ring flex items-center gap-3 rounded-card bg-surface px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand-wash text-accent dark:bg-s2">
              <Link2 aria-hidden className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="type-h3">
                <span className="num">{live}</span> of{' '}
                <span className="num">{CONNECTABLE.length}</span> connected
              </p>
              {/* NOT "4 channels available" as the reference words it. Available
                  is what the other four are NOT — they have no adapter — and a
                  reader who counts eight cards and reads "4 available" has been
                  told the wrong thing about the four below. This says which four
                  the fraction is about. */}
              <p className="type-sm mt-label-gap text-muted">
                <span className="num">{CONNECTABLE.length}</span> channels Sahoda can post to
              </p>
            </div>
          </div>
        ) : null}
      </header>

      {/* What just happened comes before what is there now. */}
      <ConnectOutcomeNotice status={zernio} />

      {connections.status === 'unreadable' ? (
        /* WE DID NOT FIND OUT. Not "no workspace" and not "no connections" —
           either would be a claim about the account drawn from a read that
           failed. This is the only branch on this page where reloading is the
           correct remedy, so it is the only one that offers it. */
        <p className="rounded-input bg-warn-bg px-3 py-2.5 type-body text-warn" role="status">
          Couldn&rsquo;t check your connections just now &mdash; reload to see what&rsquo;s already
          linked.
        </p>
      ) : connections.status === 'no-workspace' ? (
        /* NO WORKSPACE IS NOT A FAILED READ. Telling a brand-new account that
           Sahoda "couldn't check your connections" offered 18 words, zero
           controls, and the one remedy on offer (reload) could never succeed. */
        <EmptyState
          icon={Link2}
          title="Create a workspace to connect a channel"
          body="Channels belong to a workspace and you don't have one yet. Nothing failed. There is simply nothing to connect to until one exists."
          action={<CreateWorkspaceButton variant="primary" />}
        />
      ) : (
        <>
          {/* The most expensive thing on this page is a broken connection, so it
              is stated at the top and never inferred from a colour on a tile
              further down. It also owns this screen's single primary action. */}
          <ConnectionHealthBanner connections={rows} />

          {planFull ? (
            <p
              className="surface-ring rounded-card bg-s2 px-3 py-2.5 type-body text-muted"
              role="status"
            >
              {channelLimit}
            </p>
          ) : null}

          <ConnectionMarketplace
            sections={
              [
                {
                  key: 'connectable',
                  name: 'Connect your channels',
                  lead: 'Each card says what Sahoda can do there, and whether this workspace has linked it.',
                  guide: 'connections.connect_now',
                  items: CONNECTABLE.map((entry) => ({
                    id: entry.id,
                    label: entry.label,
                    kind: entry.kind,
                    blurb: entry.blurb,
                    tile: (
                      <ChannelTile
                        entry={entry}
                        connection={byChannel.get(entry.id)}
                        ration={entry.id === 'x' ? ration : undefined}
                        disabled={!(LIVE_VIA_ZERNIO.has(entry.id) && railReady && !planFull)}
                        disabledReason={
                          planFull
                            ? 'Your plan has no room for another channel.'
                            : LIVE_VIA_ZERNIO.has(entry.id)
                              ? railReady
                                ? undefined
                                : 'Publishing key isn’t set in this environment.'
                              : 'Secure token flow still being wired.'
                        }
                      />
                    ),
                  })),
                },
                {
                  key: 'planned',
                  name: 'More channels',
                  lead: "Sahoda can't post to these yet. Each one says so on its own card.",
                  guide: 'connections.coming_soon',
                  items: PLANNED.map((entry) => ({
                    id: entry.id,
                    label: entry.label,
                    kind: entry.kind,
                    blurb: entry.blurb,
                    tile: <ChannelTile entry={entry} />,
                  })),
                },
              ] satisfies MarketplaceSection[]
            }
          />
        </>
      )}
    </div>
  )
}
