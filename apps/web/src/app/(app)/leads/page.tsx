import Link from 'next/link'
import { FileInput, Inbox, Users } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { Board } from '@/components/leads/board'
import { LEADS_LIMIT, readLeads } from '@/lib/leads/read'
import { recentSites } from '@/lib/sites/read'

export const metadata = { title: 'Leads' }

/**
 * LEADS — the pipeline, and the two doors, now open.
 *
 * ── WHAT THIS SCREEN USED TO SAY, AND WHAT CHANGED ──────────────────────────
 * "There are no leads and there is no way to receive one yet." That was true:
 * `leads` shipped on 2026-07-18 with row-level security and no writer at all.
 * Both writers now exist, and both are `SECURITY DEFINER` functions rather than
 * policies, so a member still cannot insert or delete a lead directly — the two
 * assertions in `packages/db/tests/rls.test.ts` that pin exactly that are still
 * true after the migration, which is how the shape was chosen.
 *
 *   door one   `public.lead_submit` — a stranger, through /embed/lead, after a
 *              rate limit, a honeypot and a captcha. Takes a site SLUG and no
 *              workspace id, so the write cannot be aimed.
 *   door two   `public.lead_from_inbox` — a member turning a conversation the
 *              workspace already holds into a lead. Checks membership INSIDE,
 *              because definer rights bypassed the policy that would have.
 *
 * ── FOUR STAGES, NOT THE FIVE THE COLUMN ALLOWS ──────────────────────────────
 * See `lib/leads/stages.ts`. `qualified` stays a legal value nothing writes.
 *
 * ── AND NO FIGURE ON THIS SCREEN IS INVENTED ─────────────────────────────────
 * A count of rows in a column is a fact about rows the customer owns. A
 * conversion rate, a lead score or an estimated value would be a claim about
 * their business, and nothing here has earned one. `components/leads/board.test.tsx`
 * fails on any digit that is not a count.
 */

export default async function LeadsPage() {
  // `recentSites` answers null when the read failed, which is NOT the same as
  // having no site: the embed code simply does not appear, rather than the
  // screen claiming the customer has nothing to embed into.
  const [read, sites] = await Promise.all([readLeads(), recentSites(1)])

  if (read.status !== 'ok') {
    return (
      <div className="space-y-grid">
        <PageTitle sub="Everyone who got in touch, in one list, from first message to whether they bought.">
          Leads
        </PageTitle>
        <EmptyState
          icon={Users}
          title={read.status === 'no-workspace' ? 'No workspace yet' : 'Could not read your leads'}
          body={
            read.status === 'no-workspace'
              ? 'Enquiries belong to a workspace, so there has to be one first.'
              : 'Sahoda asked and got nothing back. This is not the same as having no enquiries. Reloading is worth a try.'
          }
        />
        <Doors slug={null} />
      </div>
    )
  }

  const slug = sites?.[0]?.slug ?? null

  return (
    <div className="space-y-grid">
      <PageTitle sub="Everyone who got in touch, in one list, from first message to whether they bought.">
        Leads
      </PageTitle>

      {read.leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nobody has enquired yet"
          body="When somebody fills in your contact form or messages you, they land here, with what they said and what to do next."
        />
      ) : (
        <Board leads={read.leads} />
      )}

      {read.leads.length >= LEADS_LIMIT ? (
        <p className="type-sm text-muted">
          Showing the most recent <span className="num">{LEADS_LIMIT}</span>.
        </p>
      ) : null}

      <Doors slug={slug} />
    </div>
  )
}

/**
 * How somebody gets in.
 *
 * Both doors are described as what they ARE now, and the one thing that is still
 * missing is named rather than glossed: a generated Sahoda site cannot post its
 * own contact form yet, and the reason is specific and checkable.
 */
function Doors({ slug }: { slug: string | null }) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sahodalabs.com'
  return (
    <section aria-labelledby="leads-doors" className="flex flex-col gap-3">
      <div>
        <h2 id="leads-doors" className="type-h2">
          How someone gets in
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">Two ways, and both of them work.</p>
      </div>

      <div className="grid gap-3 wide:grid-cols-2">
        <article className="surface-ring rounded-card bg-surface p-4">
          <FileInput size={16} strokeWidth={1.8} aria-hidden className="text-muted" />
          <h3 className="type-h3 mt-1.5 text-ink">A contact form on your site</h3>
          <p className="type-sm mt-1 text-muted">
            Paste this into any page you already have. It carries a captcha and a rate limit, and an
            enquiry lands here the moment it is sent.
          </p>
          {slug ? (
            <pre className="mt-2 overflow-x-auto rounded-input bg-surface-2 p-2.5 type-sm">
              <code>{`<iframe src="${origin}/embed/lead?site=${slug}" style="width:100%;height:620px;border:0"></iframe>`}</code>
            </pre>
          ) : (
            <p className="type-sm mt-2 text-muted">
              The embed code appears once you have a site. It names which site the enquiry belongs
              to.{' '}
              <Link href="/sites" className="font-[550] text-accent underline underline-offset-2">
                Make one
              </Link>
              .
            </p>
          )}
          <p className="type-sm mt-2 text-muted">
            A Sahoda site does not yet carry this form of its own. It needs two things: an address
            the public can reach, which Sites v0 does not deploy to yet, and a captcha widget inside
            the generated page. A plain HTML form cannot carry a token, and an enquiry endpoint
            without one would be open to anybody.
          </p>
        </article>

        <article className="surface-ring rounded-card bg-surface p-4">
          <Inbox size={16} strokeWidth={1.8} aria-hidden className="text-muted" />
          <h3 className="type-h3 mt-1.5 text-ink">A message in your inbox</h3>
          <p className="type-sm mt-1 text-muted">
            A comment, review or message that turns out to be somebody wanting to buy becomes a lead
            from the{' '}
            <Link href="/inbox" className="font-[550] text-accent underline underline-offset-2">
              inbox
            </Link>
            , with the conversation attached. Doing it twice does not make two leads.
          </p>
          <p className="type-sm mt-2 text-muted">
            A platform conversation carries a handle rather than an address or a number, so those
            two stay empty rather than being filled with something that is not one.
          </p>
        </article>
      </div>
    </section>
  )
}
