import Link from 'next/link'
import { Users } from 'lucide-react'
import { AUDIENCE_DIMENSIONS } from '@sahoda/publishing'

import { BreakdownCard } from '@/components/audience/breakdown'
import { InferredLine, PaceToFloor } from '@/components/audience/inferred'
import { FollowerThreshold } from '@/components/audience/threshold'
import { FollowerTrend } from '@/components/audience/trend'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { readAudiencePage, type CollectedHistory } from '@/lib/audience/page-data'

export const metadata = { title: 'Audience' }

/**
 * WHO FOLLOWS YOU — and, in one glance, which half of that Instagram measured.
 *
 * ── WHY THIS IS "AUDIENCE" AND NOT "AUDIENCE TWIN" ───────────────────────────
 * This tab used to describe a panel of generated readers that would react to your
 * drafts before you published them. The only way to build that is to invent
 * opinions for people who never gave any — fluent, confident and impossible to
 * check — which is the single class of claim this product may never make about a
 * customer's own business. So the tab now holds the thing Instagram will actually
 * tell us: who follows this account.
 *
 * ── THE PAGE HAS TWO HALVES AND THE LINE BETWEEN THEM IS THE FEATURE ─────────
 * Above `InferredLine`, every number came from a platform and is drawn with a
 * SOLID fill. Below it, every number is Sahoda's arithmetic, drawn `.is-proposed`
 * — dashed, unfilled — and each panel states the evidence it stands on. See
 * `components/audience/inferred.tsx` for why dashed rather than hatched.
 *
 * ── AND EIGHT WAYS THIS CAN GO, NOT TWO ──────────────────────────────────────
 * "Not connected", "reconnect", "not configured", "the platform cannot resolve
 * this account", "the read failed", "the platform withholds it", "the platform
 * reported nothing" and "here it is" are eight different sentences. Collapsing any
 * of them is the defect `e2e/no-impossible-remedy.spec.ts` walks every route to
 * catch, and exactly ONE of the eight may offer a retry.
 *
 * The verdict is `classifyAudience`'s, taken in `lib/audience/page-data.ts`. This
 * file renders it and never re-derives it.
 */

/** What Sahoda has kept, said plainly under the headline. */
function CollectionNote({ history }: { history: CollectedHistory }) {
  if (!history.storing || history.days === 0) {
    return (
      <p className="type-sm text-muted">
        Sahoda has not kept a day of this yet. It starts keeping one a day from the first
        collection, and Instagram cannot be asked about a day that has passed.
      </p>
    )
  }
  return (
    <p className="type-sm text-muted">
      Kept by Sahoda: <span className="num">{history.days}</span> day
      {history.days === 1 ? '' : 's'}, <span className="num">{history.firstDay}</span> to{' '}
      <span className="num">{history.lastDay}</span>. Instagram reports only today; the record
      is ours.
    </p>
  )
}

export default async function BrainAudiencePage() {
  const { state, history, username, floor } = await readAudiencePage()

  const heading = (
    <div className="flex flex-col gap-1">
      <h2 className="type-h2 text-ink">Who follows you</h2>
      <p className="type-body max-w-[68ch] text-muted">
        Instagram reports the shape of your following{username === null ? '' : ` for @${username}`}
        , and Sahoda keeps a copy each day so you can watch it change.
      </p>
    </div>
  )

  // ── 1 · NOTHING CONNECTED. Nothing has failed, and nothing is offered that
  //        cannot work: connecting is the only thing that changes this.
  if (state.kind === 'not-connected') {
    return (
      <div className="space-y-grid">
        {heading}
        <EmptyState
          icon={Users}
          title="No Instagram account is connected"
          body="Instagram is the one channel that reports who follows you. Connect an account and Sahoda starts keeping a daily record of it."
          action={
            // `buttonVariants` on a Link, NOT `<Button asChild>`. Button always
            // renders a loading-spinner slot beside its children, so Radix's Slot
            // receives two children and throws — button.tsx says so in its own
            // header, and `page.test.tsx` caught it here before a browser did.
            <Link href="/connections" className={buttonVariants({ variant: 'primary' })}>
              Connect Instagram
            </Link>
          }
        />
      </div>
    )
  }

  // ── 2 · CONNECTED, BUT NOT ACTIVE. "Connect Instagram" is useless advice to
  //        someone who already did; this is a different sentence and a different
  //        destination is not needed, only different words.
  if (state.kind === 'reconnect') {
    return (
      <div className="space-y-grid">
        {heading}
        <EmptyState
          icon={Users}
          title="Your Instagram connection has lapsed"
          body="The account is still linked, but the permission Instagram gave Sahoda has run out. Sign in again on Connections and the daily record picks up where it stopped."
          action={
            // `buttonVariants` on a Link, NOT `<Button asChild>`. Button always
            // renders a loading-spinner slot beside its children, so Radix's Slot
            // receives two children and throws — button.tsx says so in its own
            // header, and `page.test.tsx` caught it here before a browser did.
            <Link href="/connections" className={buttonVariants({ variant: 'primary' })}>
              Reconnect Instagram
            </Link>
          }
        />
      </div>
    )
  }

  // ── 3 · NO KEY IN THIS DEPLOYMENT. Nothing was attempted, so nothing failed,
  //        and no retry is offered — trying again cannot conjure an environment
  //        variable. Whatever WAS collected still shows.
  if (state.kind === 'not-configured') {
    return (
      <div className="space-y-grid">
        {heading}
        <section className="surface-ring flex flex-col gap-2 rounded-card bg-surface p-4">
          <h3 className="type-h3 text-ink">This copy of Sahoda cannot reach Instagram</h3>
          <p className="type-body max-w-[62ch] text-muted">
            Your account is connected. This deployment is missing the credential Sahoda uses to
            ask Instagram anything, so no request went out. Nothing failed and nothing here is
            wrong &mdash; it is a setting on our side.
          </p>
          <CollectionNote history={history} />
        </section>
        {history.followers.length > 0 ? <Kept history={history} floor={floor} /> : null}
      </div>
    )
  }

  // ── 4 · THE PLATFORM CANNOT RESOLVE THIS ACCOUNT. Permanent until someone
  //        reconnects. A retry would never succeed.
  if (state.kind === 'unresolved') {
    return (
      <div className="space-y-grid">
        {heading}
        <section className="surface-ring flex flex-col gap-2 rounded-card bg-surface p-4">
          <h3 className="type-h3 text-ink">Instagram no longer recognises this account</h3>
          <p className="type-body max-w-[62ch] text-muted">
            Sahoda asked and Instagram answered that it cannot find the account this workspace
            is linked to. That usually means the login behind it changed. Linking it again on{' '}
            <Link href="/connections" className="font-[550] text-accent underline underline-offset-2">
              Connections
            </Link>{' '}
            restores it. Everything already collected is kept.
          </p>
          <CollectionNote history={history} />
        </section>
        {history.followers.length > 0 ? <Kept history={history} floor={floor} /> : null}
      </div>
    )
  }

  // ── 5 · THE READ FAILED. The ONE state where "try again" is honest, and the
  //        only place on this page that word appears.
  if (state.kind === 'unreadable') {
    return (
      <div className="space-y-grid">
        {heading}
        <section className="surface-ring flex flex-col gap-2 rounded-card bg-surface p-4">
          <h3 className="type-h3 text-ink">Instagram did not answer just now</h3>
          <p className="type-body max-w-[62ch] text-muted">
            The request went out and nothing came back. Try again in a moment &mdash; this is the
            only thing on this page a retry can fix.
          </p>
          <CollectionNote history={history} />
        </section>
        {history.followers.length > 0 ? <Kept history={history} floor={floor} /> : null}
      </div>
    )
  }

  // ── 6 · UNDER THE PLATFORM'S FLOOR. The state most beta accounts are in, and
  //        the one the page is designed around.
  if (state.kind === 'suppressed') {
    return (
      <div className="space-y-grid">
        {heading}
        <FollowerThreshold followers={state.followers} floor={state.floor} />
        <Kept history={history} floor={floor} showTrend />
        <InferredLine />
        <PaceToFloor days={history.followers} floor={floor} />
      </div>
    )
  }

  // ── 7 · THE PLATFORM REPORTED NOTHING AND THE FOLLOWER COUNT DOES NOT EXPLAIN
  //        IT. A different claim from 6: there, a documented rule accounts for the
  //        silence; here we genuinely do not know why, and say so.
  if (state.kind === 'no-data') {
    return (
      <div className="space-y-grid">
        {heading}
        <section className="surface-ring flex flex-col gap-2 rounded-card bg-surface p-4">
          <h3 className="type-h3 text-ink">Instagram reported nothing for this period</h3>
          <p className="type-body max-w-[62ch] text-muted">
            The account is connected and Instagram answered, but it sent no age, gender, city or
            country figures{state.timeframe === null ? '' : ` for ${state.timeframe.replace(/_/g, ' ')}`}.
            {state.followers === null
              ? ' Sahoda has no follower count for this account either, so it will not guess at why.'
              : ` Your ${state.followers.toLocaleString()} followers are above the ${floor} Instagram needs, so that is not the reason. Sahoda will not guess at what is.`}
          </p>
          <CollectionNote history={history} />
        </section>
        <Kept history={history} floor={floor} showTrend />
      </div>
    )
  }

  // ── 8 · REAL DATA. UNVERIFIED IN PRODUCTION: every workspace on this deployment
  //        is under the floor, so this branch has never rendered against a live
  //        payload. Its shape comes from Zernio's own documented example and is
  //        exercised by `audience-page.test.tsx`.
  const reported = AUDIENCE_DIMENSIONS.filter((d) => state.breakdown[d] !== undefined)
  return (
    <div className="space-y-grid">
      {heading}

      <section className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4 wide:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="type-hero-num num text-ink">
              {state.followers === null ? '' : state.followers.toLocaleString()}
            </span>
            <h3 className="type-h3 text-ink">
              {state.followers === null ? 'Followers' : 'followers'}
            </h3>
          </div>
          {state.timeframe === null ? null : (
            <span className="type-sm text-muted">
              Instagram&rsquo;s figures cover {state.timeframe.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <FollowerTrend days={history.followers} />
        <CollectionNote history={history} />
      </section>

      {/* A dimension Instagram did not report has NO CARD. Not an empty card, not
          a card of dashes — the absence vocabulary's third state: if the quantity
          does not exist, delete the slot. */}
      <div className="grid gap-3 narrow:grid-cols-2">
        {reported.map((dimension) => (
          <BreakdownCard
            key={dimension}
            dimension={dimension}
            buckets={state.breakdown[dimension] ?? []}
            followers={state.followers}
          />
        ))}
      </div>

      <InferredLine />
      <PaceToFloor days={history.followers} floor={floor} />
    </div>
  )
}

/** The kept record, when there is one. Shared by every branch that has history. */
function Kept({
  history,
  floor: _floor,
  showTrend = false,
}: {
  history: CollectedHistory
  floor: number
  showTrend?: boolean
}) {
  if (!history.storing || history.followers.length === 0) {
    return (
      <section className="surface-ring flex flex-col gap-2 rounded-card bg-surface p-4">
        <h3 className="type-h3 text-ink">Nothing kept yet</h3>
        <CollectionNote history={history} />
      </section>
    )
  }
  return (
    <section className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4">
      <h3 className="type-h3 text-ink">Followers, day by day</h3>
      {showTrend ? <FollowerTrend days={history.followers} /> : null}
      <CollectionNote history={history} />
    </section>
  )
}
