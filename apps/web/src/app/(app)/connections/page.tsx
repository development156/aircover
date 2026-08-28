import { Link2 } from 'lucide-react'
import { ZERNIO_PLATFORMS } from '@sahoda/shared'

import { ChannelTile } from '@/components/connections/channel-tile'
import { PageTitle } from '@/components/page-title'
import {
  ConnectionMarketplace,
  type MarketplaceSection,
} from '@/components/connections/connection-marketplace'
import { ConnectionHealthBanner } from '@/components/connections/connection-health-banner'
import { ConnectOutcomeNotice } from '@/components/connections/connect-outcome-notice'
import type { XRationMeterProps } from '@/components/connections/x-ration-meter'
import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { checkCountableLimit } from '@/lib/billing/entitlements'
import { PLANNED } from '@/lib/connections/catalogue'
import { groupChannels } from '@/lib/connections/groups'
import { readConnections, readConnectionSlots } from '@/lib/connections/read'
import { groupByPlatform, hasHeadroom, slotSentence, type SlotUsage } from '@/lib/connections/slots'
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
 * The grouping is now **by readiness**, which is both the honest cut and the one
 * that keeps moving on its own: six channels can be connected today and two are
 * named and unbuilt, and those counts changed on 2026-08-26 without this file
 * being edited, because both groups are filtered from the catalogue rather than
 * counted by hand. The question
 * the old grouping answered ("why is Google Business Profile in with Instagram?")
 * is answered better on the tile itself, where each channel states its `kind`
 * — *Feed*, *Local listing*, *Short video*, *Broadcast* — beside its own name,
 * rather than by a heading the reader has to scroll back to.
 *
 * ── THE BROWSE LAYER, AND WHY IT DID NOT REPLACE THE GROUPING ────────────────
 * A category rail and a search field sit above all three groups
 * (`ConnectionMarketplace`). The rail filters by the catalogue's own `kind` and
 * counts every facet from the entries rather than storing a number, so a
 * sixteenth channel appears in the sidebar the day its catalogue row lands and
 * nothing here has to be told about it.
 *
 * It is a FILTER and not a set of headings, which is the §3.4 lesson above
 * applied rather than forgotten: six of the nine kinds hold one or two channels,
 * so heading by kind would put six paperweights on the page. Filtering down to
 * one card is a result a person asked for; a heading over one card is a layout
 * mistake. The three groups still answer the three questions; the rail answers
 * "where is Pinterest", which at twenty cards is a real question and was not one
 * at eight.
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
 *
 * ── DERIVED FROM THE SHARED ALLOWLIST, NOT RESTATED ─────────────────────────
 *
 * This was a hand-written set of four. It is the same list `ZERNIO_PLATFORMS`
 * already holds — the one both OAuth routes validate against — so keeping a
 * second copy here meant a channel could be connectable at the route and
 * disabled on the screen, or the reverse, with nothing failing. When facebook
 * and telegram were added the literal would have silently kept both buttons
 * dead while the routes happily accepted them.
 */
const LIVE_VIA_ZERNIO: ReadonlySet<string> = new Set<string>(ZERNIO_PLATFORMS)

/**
 * How many slots this workspace has used, and how many the plan allows.
 *
 * ── ONE READ, TWO NUMBERS, AND BOTH ARE ABOUT THE CUSTOMER ───────────────────
 * This used to return a SENTENCE and nothing else, which was all the screen
 * needed while the only thing it drew was a banner. A meter needs the
 * denominator, and parsing it back out of English is the sort of thing that
 * works until the copy is rewritten — so `checkCountableLimit` now carries the
 * limit on `blocked` as well as on `allowed`.
 *
 * Read from the DATABASE, never from the query string — the same rule
 * `ConnectOutcomeNotice` follows when it refuses to render counts off the address
 * bar. `limit: null` on every "could not tell" case, and `hasHeadroom` treats
 * that as no room: the two OAuth routes fail closed regardless, so nothing is
 * admitted by this being unknown; what it avoids is telling someone their plan is
 * full when the truth is we could not read it.
 */
async function readSlotUsage(): Promise<SlotUsage & { blockedSentence: string | null }> {
  const unknown = { used: 0, limit: null, blockedSentence: null }

  const workspace = await getActiveWorkspace()
  if (!workspace) return unknown

  const slots = await readConnectionSlots(workspace.id)
  if (slots === null) return unknown

  const verdict = await checkCountableLimit(workspace.id, 'channels', slots.count)
  if (verdict.kind === 'unknown') return { ...unknown, used: slots.count }

  return {
    used: slots.count,
    limit: verdict.limit,
    blockedSentence: verdict.kind === 'blocked' ? verdict.sentence : null,
  }
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
  const [connections, { zernio }, slots, ration] = await Promise.all([
    readConnections(),
    searchParams,
    readSlotUsage(),
    xRation(),
  ])
  const railReady = zernioAvailable()
  // `hasHeadroom` is the single question every control on this page asks, and an
  // UNKNOWN limit answers it "no" — the same direction both OAuth routes fail in.
  const roomLeft = hasHeadroom(slots)
  const planFull = slots.blockedSentence !== null

  // One lookup, so a channel appears exactly once whether or not it is linked.
  const rows = connections.status === 'ok' ? connections.connections : []
  // ── EVERY ACCOUNT, NOT THE LAST ONE WRITTEN ───────────────────────────────
  // This was `new Map(rows.map((c) => [c.platform, c]))`. A Map keeps the LAST
  // value for a key and the rows arrive oldest first, so a workspace with two
  // Instagram accounts rendered the newer one and the older one appeared nowhere
  // on this screen, while still holding a slot and still publishing.
  //
  // Keyed by STRING, not by `ConnectionPlatform`. A catalogue id is the wider
  // union, and casting it narrow at four call sites to satisfy the map would be
  // asserting the very thing `asChannel` exists to check. A planned channel
  // simply never matches a row, because the database cannot hold one.
  const byChannel = groupByPlatform(rows)

  /**
   * ── THREE GROUPS, EACH ANSWERING A DIFFERENT QUESTION ────────────────────
   * Derived, never hand-listed. `LIVE_VIA_ZERNIO` is `ZERNIO_PLATFORMS` and
   * `byChannel` is the customer's own rows, so both cuts move on their own the
   * day either changes — which is the property the old two literal groups
   * lacked, and how a channel once ended up connectable at the route and
   * disabled on the screen with nothing failing.
   *
   *   linked    an account exists            → what is live
   *   open      connectable, none linked yet → what you can add
   *   stalled   named, and we cannot link it → why not
   *
   * The split itself lives in `lib/connections/groups.ts`, because nothing
   * imports this file and so nothing could test it here. MEASURED: with the
   * grouping inline, deleting the hiding filter from both offer groups left
   * typecheck, lint and all 5724 unit tests green.
   */
  const {
    linked: linkedEntries,
    open: openEntries,
    stalled: stalledEntries,
  } = groupChannels({
    liveVia: LIVE_VIA_ZERNIO,
    linkedCount: (id) => byChannel.get(id)?.length ?? 0,
  })

  /**
   * Why Connect is unavailable on this tile, or `undefined` when it is not.
   *
   * ── ONE FUNCTION BECAUSE THE ORDER OF THESE IS LOAD-BEARING ──────────────
   * It was a nested ternary inlined at one call site and there are now three, so
   * copying it would be three places for the precedence to drift. The order:
   * the plan first, because a full plan blocks every tile and saying anything
   * else would be answering a question the customer did not reach yet; then the
   * environment; then the platform's own reason last, because it is the only one
   * that differs per tile.
   */
  function connectBlocker(id: string): string | undefined {
    if (planFull) return 'Every slot on your plan is in use.'
    if (slots.limit === null) return 'Sahoda couldn’t check how many slots your plan includes.'
    if (!railReady) return 'Publishing key isn’t set in this environment.'
    if (LIVE_VIA_ZERNIO.has(id)) return undefined
    // NOT "secure token flow still being wired", which was written for a
    // different cause and is now false. A platform outside ZERNIO_PLATFORMS is
    // one whose connect is not an OAuth handoff at all — MEASURED, Telegram's
    // returns a bot code and a fifteen-minute expiry instead of an authUrl.
    // Naming the real reason is what stops this reading as a fault someone could
    // wait out by pressing again.
    return 'This channel connects with a bot code instead, and that isn’t built yet.'
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        {/* ── THE TRAIL, AND WHY IT IS NOT A SET OF LINKS ──────────────────
            The reference this screen was redrawn from opens with
            `Connections › Integrate` rather than a page title. Both segments are
            here and neither is an anchor, because there is no
            `/connections/integrate` route and no parent above `/connections`: the
            first crumb would link to the page already open and the second would
            name a page that does not exist. There is no `<nav>` over them for the
            same reason. `PageTitle` carries the full reasoning and the contrast
            measurement behind the segment's colour. */}
        <PageTitle
          crumb="Integrate"
          /* The reference reads "Browse available platforms and choose the next
             connection to add." This screen also holds the accounts already
             linked and the controls that disconnect them, so that sentence is
             true of less of the page than the one it would replace. Copy rule 1:
             a rewrite may not be true in fewer cases. This keeps the reference's
             job — say what browsing is for — and stays true of all three groups. */
          sub="Browse every platform Sahoda can connect, add the next one, and manage what is already linked."
        >
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
              {/* ── SLOTS USED, NOT CHANNELS CONNECTED ──────────────────────
                  This read "2 of 4 connected", where the 4 was the number of
                  channels SAHODA has built. It moved when we shipped an adapter
                  and never when the customer changed plan: on Studio (12 slots)
                  it still said "of 4", and on Free (2 slots) it said "of 4" too,
                  two paragraphs above a banner that said "Your Free plan includes
                  2 channels". One screen, two denominators, and the small grey
                  one was the true one.

                  The number that decides whether Connect works is the ACCOUNT
                  count against the plan's allowance, so that is the number here.
                  A slot holds one account: four Instagram accounts are four
                  slots, one channel. */}
              <p className="type-h3">
                {slots.limit === null ? (
                  <>
                    <span className="num">{slots.used}</span> {slots.used === 1 ? 'slot' : 'slots'}{' '}
                    used
                  </>
                ) : (
                  <>
                    <span className="num">{slots.used}</span> of{' '}
                    <span className="num">{slots.limit}</span> slots used
                  </>
                )}
              </p>
              <p className="type-sm mt-label-gap text-muted">{slotSentence(slots)}</p>
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

          {slots.blockedSentence ? (
            <p
              className="surface-ring rounded-card bg-s2 px-3 py-2.5 type-body text-muted"
              role="status"
            >
              {slots.blockedSentence}{' '}
              {/* The sentence from the gate names the plan and the count. This
                  half names what a slot IS, because "channels" and "slots" are
                  different counts on this screen and the reader is owed the
                  difference: two Instagram accounts and a LinkedIn page is three
                  slots and two channels. */}
              Each connected account uses one slot.
            </p>
          ) : null}

          {/* ── THE THREE GROUPS, BROWSABLE ─────────────────────────────────
              The grid went from eight tiles to twenty on 2026-08-26, and at
              twenty the old single grid stopped answering the screen's first
              question. "Which of my channels is live" was a hunt through four
              rows of mostly-identical cards for the two carrying an account.

              The groups below are unchanged: linked, open, stalled, each
              answering a different question. What is new is a category rail and
              a search field over all three, because twenty cards is also the
              point at which "where is Pinterest" stops being answerable by
              looking. `ConnectionMarketplace` filters; it does not regroup, and
              it renders no heading over an empty group — so "Your channels" over
              nothing, which would be a section that exists to say the customer
              has done nothing, still cannot happen. */}
          <ConnectionMarketplace
            sections={
              [
                {
                  key: 'linked',
                  name: 'Your channels',
                  lead: 'Linked accounts Sahoda can reach. Open Details on any card for what it can do.',
                  guide: 'connections.linked',
                  items: linkedEntries.map((entry) => ({
                    id: entry.id,
                    label: entry.label,
                    kind: entry.kind,
                    blurb: entry.blurb,
                    tile: (
                      <ChannelTile
                        entry={entry}
                        connections={byChannel.get(entry.id) ?? []}
                        ration={entry.id === 'x' ? ration : undefined}
                        disabled={!(railReady && roomLeft)}
                        disabledReason={connectBlocker(entry.id)}
                      />
                    ),
                  })),
                },
                {
                  key: 'open',
                  name: linkedEntries.length > 0 ? 'Add a channel' : 'Connect your channels',
                  lead: 'Every one of these opens a sign-in window and comes straight back.',
                  guide: 'connections.connect_now',
                  items: openEntries.map((entry) => ({
                    id: entry.id,
                    label: entry.label,
                    kind: entry.kind,
                    blurb: entry.blurb,
                    tile: (
                      <ChannelTile
                        entry={entry}
                        connections={[]}
                        ration={entry.id === 'x' ? ration : undefined}
                        disabled={!(railReady && roomLeft)}
                        disabledReason={connectBlocker(entry.id)}
                      />
                    ),
                  })),
                },
                {
                  /* ── ONE GROUP FOR EVERY KIND OF "NO", AND EACH CARD SAYS WHICH
                     Telegram and Snapchat are both unconnectable and for
                     completely different reasons: Telegram's connect endpoint
                     answers 200 with a bot CODE rather than an authUrl, so the
                     OAuth rail cannot carry it and the surface it needs is
                     unbuilt; Snapchat answers 403 `PLATFORM_BETA_RESTRICTED`, so
                     nothing we build would help. Both MEASURED 2026-08-26.

                     They share a heading because what the reader can do about
                     them is the same — nothing, today — and they carry different
                     sentences because "we never built it" and "they will not let
                     us" are different claims and this product does not blur
                     those. */
                  key: 'stalled',
                  name: 'Not available yet',
                  lead: "Sahoda can't link these today. Each card says why, and they are different reasons.",
                  guide: 'connections.coming_soon',
                  items: [
                    ...stalledEntries.map((entry) => ({
                      id: entry.id,
                      label: entry.label,
                      kind: entry.kind,
                      blurb: entry.blurb,
                      tile: (
                        <ChannelTile
                          entry={entry}
                          connections={byChannel.get(entry.id) ?? []}
                          disabled
                          disabledReason={connectBlocker(entry.id)}
                        />
                      ),
                    })),
                    /* `connections` is required and explicitly EMPTY, not
                       optional. A planned channel cannot hold a row — the CHECK
                       constraint sees to it — and making the prop required means
                       the type system asks every call site the question rather
                       than defaulting one of them to a silent `undefined`. */
                    ...PLANNED.map((entry) => ({
                      id: entry.id,
                      label: entry.label,
                      kind: entry.kind,
                      blurb: entry.blurb,
                      tile: <ChannelTile entry={entry} connections={[]} />,
                    })),
                  ],
                },
              ] satisfies MarketplaceSection[]
            }
          />
        </>
      )}
    </div>
  )
}
