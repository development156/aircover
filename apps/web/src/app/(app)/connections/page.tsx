import { Link2 } from 'lucide-react'
import type { ConnectionPlatform } from '@sahoda/shared'

import { ChannelTile } from '@/components/connections/channel-tile'
import { Stagger } from '@/components/motion/stagger'
import { ConnectionHealthBanner } from '@/components/connections/connection-health-banner'
import { ConnectOutcomeNotice } from '@/components/connections/connect-outcome-notice'
import type { XRationMeterProps } from '@/components/connections/x-ration-meter'
import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { PageTitle } from '@/components/page-title'
import { checkCountableLimit } from '@/lib/billing/entitlements'
import { CONNECTABLE, PLANNED } from '@/lib/connections/catalogue'
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
 * The grouping is now **by readiness**, which is both the honest cut and an even
 * one — four connectable channels, four that are named and unbuilt. The question
 * the old grouping answered ("why is Google Business Profile in with Instagram?")
 * is answered better on the tile itself, where each channel states its `kind`
 * — *Feed*, *Local listing*, *Short video*, *Broadcast* — beside its own name,
 * rather than by a heading the reader has to scroll back to.
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

          <ChannelGroup
            name="Connect your channels"
            lead="Each card says what Sahoda can do there, and whether this workspace has linked it."
            /* The count moved into the header card. Printing it here as well
               would put one number in two places, which is how they drift. */
            guide="connections.connect_now"
          >
            {CONNECTABLE.map((entry) => (
              <ChannelTile
                key={entry.id}
                entry={entry}
                connections={byChannel.get(entry.id) ?? []}
                ration={entry.id === 'x' ? ration : undefined}
                disabled={!(LIVE_VIA_ZERNIO.has(entry.id) && railReady && roomLeft)}
                disabledReason={
                  planFull
                    ? 'Every slot on your plan is in use.'
                    : slots.limit === null
                      ? 'Sahoda couldn’t check how many slots your plan includes.'
                      : LIVE_VIA_ZERNIO.has(entry.id)
                        ? railReady
                          ? undefined
                          : 'Publishing key isn’t set in this environment.'
                        : 'Secure token flow still being wired.'
                }
              />
            ))}
          </ChannelGroup>

          <ChannelGroup
            name="More channels"
            lead="Sahoda can't post to these yet. Each one says so on its own card."
            /* No count. "0 of 4 connected" on a group nothing can connect to
               would be a fraction whose numerator can never move — a number
               that looks like progress and is a constant. */
            guide="connections.coming_soon"
          >
            {/* `connections` is required and explicitly EMPTY, not optional. A
                planned channel cannot hold a row — the CHECK constraint sees to
                it — and making the prop required means the type system asks
                every call site the question rather than defaulting one of them
                to a silent `undefined`. */}
            {PLANNED.map((entry) => (
              <ChannelTile key={entry.id} entry={entry} connections={[]} />
            ))}
          </ChannelGroup>
        </>
      )}
    </div>
  )
}

/**
 * One heading, one grid.
 *
 * `items-stretch` is the default and is load-bearing here: tiles carry different
 * amounts of content — X alone carries the spend meter — and a grid of eight
 * cards with eight different heights is exactly the loose rhythm §3.4 measures
 * inside this app's otherwise tight chrome. The tiles are `h-full` and push their
 * controls to the floor with `mt-auto`, so the row's tallest tile sets the height
 * and every control still lines up.
 */
function ChannelGroup({
  name,
  lead,
  count,
  guide,
  children,
}: {
  name: string
  /** One line saying what the group IS, when the heading alone cannot. */
  lead?: string
  count?: string
  guide: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3" data-guide={guide}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="type-h2">{name}</h2>
          {/* Words, not a pill. The old `2/4` badge was a hand-rolled chip that
              existed nowhere else in the system, and a bare fraction beside a
              heading reads as a score. "2 of 4 connected" says which two things
              are being compared. */}
          {count ? <span className="type-sm num text-muted">{count}</span> : null}
        </div>
        {lead ? <p className="type-sm text-muted">{lead}</p> : null}
      </div>
      {/* `.enter-step` is this product's ONE entrance (docs/37 §12) and it is
          already reduced-motion safe in tokens.css, which zeroes delay as well
          as duration — without that, `fill: both` left staggered rows invisible
          for the length of their delay. Using the primitive rather than a new
          animation is also why no dependency was added for this. */}
      <Stagger
        className="grid items-stretch gap-4 wide:grid-cols-4 max-wide:grid-cols-2 max-narrow:grid-cols-1"
        itemClassName="h-full"
      >
        {children}
      </Stagger>
    </section>
  )
}
