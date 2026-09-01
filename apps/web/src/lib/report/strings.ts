/**
 * EVERY WORD THE CMO REPORT SAYS, IN ONE FILE.
 *
 * ── WHY ONE FILE ─────────────────────────────────────────────────────────────
 * This page is read by a shop owner on a phone, between customers, in under a
 * minute. Its sentences are the product. Keeping them in one module means they
 * can be reviewed as prose in a single sitting, and translated to Hindi and the
 * other regional languages without a translator opening a screen.
 *
 * ── THE BANNED WORDS ARE ENFORCED, NOT REQUESTED ─────────────────────────────
 * `strings.test.ts` scans this file and the report's components for the words
 * below. A guard nobody has watched fail is not a guard, so that test was proven
 * by planting one and watching it go red.
 *
 * ── FIRST PERSON FOR SAHODA, SECOND FOR THE OWNER ────────────────────────────
 * "I moved next week's posts", "your normal". The rest of the product speaks of
 * Sahoda in the third person; this page is the one exception, because it is
 * written as a report FROM an employee, and an employee does not refer to
 * themselves by name.
 */

import { credits } from '@/lib/credit-words'

export const BANNED_WORDS = [
  'impressions',
  'ctr',
  'engagement rate',
  'funnel',
  'kpi',
  'leverage',
  'optimise',
  'optimize',
] as const

export const REPORT = {
  title: 'CMO Report',
  subtitle: 'What last week did, what I learned from it, and what I have changed.',

  sendToWhatsapp: 'Send to WhatsApp',

  /** The principle line. Visible whenever the report is holding something back. */
  principle: 'Sahoda only speaks when the numbers are strong enough to stand behind.',

  verdict: {
    /**
     * THE COUNT IS PASSED IN, AND IT USED NOT TO BE.
     * This read "One post measured so far" at every count below the floor,
     * including a workspace with none measured and one with four posts out and
     * nothing reported back yet. A hardcoded figure about somebody's week is a
     * fabricated measurement whatever else is true of the sentence.
     */
    tooFewPosts: (measured: number) =>
      measured === 0
        ? 'Nothing of yours has come back with numbers yet. I will have a read on your week once it does.'
        : 'One post measured so far. I will have a read on your week once a few more have gone out.',
    noBaseline: 'First weeks. I am still learning what a normal week looks like for you.',
    unreadable: 'I could not read last week just now, so I am not going to call it either way.',
  },

  numbers: {
    reach: { label: 'People reached', href: '/analytics' },
    replies: { label: 'People who replied', href: '/inbox' },
    enquiries: { label: 'Enquiries', href: '/leads' },
    stillLearning: 'first weeks, still learning your normal',
    unreadable: 'I could not read this one just now',
    upOnNormal: (pct: number) => `up ${pct}% on your normal`,
    downOnNormal: (pct: number) => `down ${pct}% on your normal`,
    sameAsNormal: 'about your normal',
    upOnLastWeek: (pct: number) => `up ${pct}% on last week`,
    downOnLastWeek: (pct: number) => `down ${pct}% on last week`,
    sameAsLastWeek: 'the same as last week',
    unanswered: (n: number) =>
      n === 0
        ? 'all of them answered'
        : n === 1
          ? '1 still waiting on you'
          : `${n} still waiting on you`,
  },

  worked: {
    bestTitle: 'What worked',
    weakTitle: 'What did not',
    /**
     * NO REASON IS GIVEN, and the absence is the honest part. A reason would be
     * Sahoda asserting a cause, and nothing in this product has tested one. The
     * day a test exists, this string is replaced by its result.
     */
    noReason: 'I have not worked out why, and I will not guess.',
    tooFew: 'Fewer than two of your posts were measured, so there is no best and worst to name.',
  },

  changed: {
    title: 'What I changed because of it',
    nothing: 'Nothing worth changing yet. One more week of numbers and I will have something.',
    oneSignal: 'Nothing yet. I do not change the plan on one post.',
  },

  plan: {
    title: "This week's plan",
    empty: 'Nothing is written for this week yet.',
    approveAll: 'Approve all',
    status: {
      awaiting_approval: 'awaiting approval',
      scheduled: 'scheduled',
      drafted: 'drafted',
    },
  },

  oneThing: {
    title: 'One thing worth your time',
    nothing: 'Nothing needs you this week. That is the point.',
    enquiries: (n: number) => ({
      body:
        n === 1
          ? 'One enquiry is waiting for a reply. That is a person who asked to hear from you.'
          : `${n} enquiries are waiting for a reply. Those are people who asked to hear from you.`,
      action: 'Open your enquiries',
      href: '/leads',
    }),
    approvals: (n: number) => ({
      body:
        n === 1
          ? 'One post is written and waiting on you before it can go out.'
          : `${n} posts are written and waiting on you before they can go out.`,
      action: 'Review and approve',
      href: '/loop',
    }),
    lapsed: (channel: string) => ({
      body: `Your ${channel} account has stopped letting me in, so nothing can go out there.`,
      action: 'Reconnect it',
      href: '/connections',
    }),
    brain: (n: number) => ({
      body: `${n} things about your business are still unconfirmed, and I write worse without them.`,
      action: 'Confirm them',
      href: '/brain',
    }),
  },

  credits: {
    line: (spent: number, budget: number | null) =>
      budget === null
        ? `${credits(spent)} used this week.`
        : `${spent} of your ${credits(budget)} used this week.`,
    link: 'See every charge',
    href: '/wallet',
  },

  /**
   * A CONNECTED WORKSPACE THAT HAS NOT RUN A WEEK YET IS A DIFFERENT SENTENCE.
   * It is not "connect a channel" — they did that. It is "the week has not been
   * run", and the remedy is the one thing that would produce a report.
   */
  noCycle: {
    heading: 'No week has been reported yet',
    body: 'I write this at the end of each week I run. Run one and this page fills in with what your posts did, what I learned, and what I changed because of it.',
    action: { label: 'Run a week', href: '/loop' },
  },

  empty: {
    heading: 'Your first report lands next Monday',
    body: "Sahoda reads your published posts once a week, then tells you what worked, what it learned, and what it's changing. Connect a channel and publish your first post. The rest fills in on its own.",
    primary: { label: 'Connect a channel', href: '/connections' },
    secondary: { label: 'Write a post', href: '/create/post' },
    sampleLabel: 'This is what it will look like.',
  },

  failure: {
    section: 'I could not read this part just now.',
    workspace: 'Finish setting up your workspace and your reports appear here.',
  },
} as const
