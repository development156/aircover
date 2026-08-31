import type { ReportView } from './model'

/**
 * WHAT THE REPORT WILL LOOK LIKE, AND WHY THIS IS NOT A FABRICATED NUMBER.
 *
 * The one rule this file has to answer to: never show a number the product did
 * not produce. These figures are not presented as anybody's week. They sit under
 * a label that says what they are, at 40% opacity, hidden from screen readers,
 * and nothing in the block is clickable. A reader cannot mistake this for their
 * own report, because they do not have one yet — that is the state this renders
 * in, and the card above it says so in the first line.
 *
 * They are also deliberately modest. A sample showing 40,000 people reached
 * would be a promise about results, which is a different lie from a fabricated
 * measurement and just as bad.
 */
export const SAMPLE_REPORT: ReportView = {
  week: { label: 'Week of 18 to 24 August', postsRan: 4, channels: ['Instagram', 'LinkedIn'] },
  verdict: {
    kind: 'good',
    headline: 'A good week.',
    support: 'More people saw you than usual, 34% above your normal, and more of them wrote back.',
  },
  numbers: {
    reach: { status: 'ok', value: 1240, comparison: 'up 34% on your normal' },
    replies: { status: 'ok', value: 18, comparison: 'up 12% on last week' },
    enquiries: { status: 'ok', value: 3, comparison: '1 still waiting on you' },
  },
  worked: {
    best: {
      postId: 'sample-best',
      title: 'Monsoon offer: two treatments, one price, until Sunday',
      channel: 'instagram',
      channelName: 'Instagram',
      value: 610,
      measure: 'people reached',
    },
    weakest: {
      postId: 'sample-weak',
      title: 'A few thoughts on how we think about our craft',
      channel: 'linkedin',
      channelName: 'LinkedIn',
      value: 88,
      measure: 'people reached',
    },
  },
  changed: [
    'Moved next week’s posts to Tuesday and Thursday mornings',
    'Writing two more offer posts. That format is working for you',
  ],
  plan: [
    {
      id: 'sample-1',
      title: 'Tuesday offer: bring a friend, both save',
      channels: ['Instagram'],
      when: 'Tue, 09:00 am IST',
      status: 'awaiting_approval',
    },
    {
      id: 'sample-2',
      title: 'Thursday: what a first visit actually looks like',
      channels: ['Instagram', 'LinkedIn'],
      when: 'Thu, 09:00 am IST',
      status: 'scheduled',
    },
  ],
  oneThing: {
    body: 'One enquiry is waiting for a reply. That is a person who asked to hear from you.',
    action: 'Open your enquiries',
    href: '/leads',
  },
  credits: { spent: 20, budget: 150 },
}
