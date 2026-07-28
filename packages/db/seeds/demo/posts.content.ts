import type { Channel, PostOrigin, PostStatus } from '@sahoda/shared'

/**
 * The frozen demo copy, split out of posts.ts so the prose has a file of its own: this is
 * where someone editing the shop's voice looks, and it keeps posts.ts (the seeding logic)
 * under the spec's 300-line limit. Nothing here has behaviour — posts.ts owns all of it.
 */

export interface DemoPost {
  labelTail: string
  title: string
  body: string
  status: PostStatus
  channels: readonly Channel[]
  origin: PostOrigin
  dayOffset: number | null
  timeOfDay: string | null
  /**
   * True when this post went through a SIMULATED publish — the fixture adapter, no network
   * I/O, nothing on any timeline. Omitted = false.
   *
   * Deliberately a separate flag rather than `status: 'published'`. `apps/web`'s own publish
   * action refuses to flip a post to 'published' off a fixture run and names the reason
   * ("would be a fabricated success state"); a seed that writes it anyway hands the room a
   * green Published chip for a post that was never published anywhere. The honest lifecycle
   * value for content that cleared review and never went out is 'approved', and the
   * simulation shows up where the app puts it: `mode='fixture'` publish logs and
   * `fixture://` permalinks.
   */
  simulatedPublish?: boolean
}

/** The frozen catalog. ledger/planner/ops read post labels from here, never re-type them. */
export const DEMO_POSTS: readonly DemoPost[] = [
  {
    labelTail: 'monsoon-reading-list',
    title: 'Monsoon reading list',
    body: 'The monsoon table is up: ten slow reads for wet Cuttack afternoons, chai at ₹20, and the window seat while it pours.',
    status: 'approved',
    simulatedPublish: true,
    channels: ['x', 'gbp', 'instagram'],
    origin: 'plan_week',
    dayOffset: -3,
    timeOfDay: '09:00',
  },
  {
    labelTail: 'new-arrival-odia-poetry',
    title: 'New Odia poetry on the shelf',
    body: 'Fresh Odia poetry arrived this week, including Ramakanta Rath and two younger Cuttack poets. ₹150 to ₹320.',
    status: 'approved',
    simulatedPublish: true,
    channels: ['x', 'instagram'],
    origin: 'manual',
    dayOffset: -6,
    timeOfDay: '18:30',
  },
  {
    labelTail: 'saturday-book-club',
    title: 'Saturday book club, 5pm',
    body: 'Book club meets upstairs every Saturday at 5pm. July book is Gopinath Mohanty. Free to join, chai at ₹20.',
    status: 'approved',
    simulatedPublish: true,
    channels: ['gbp', 'x'],
    origin: 'manual',
    dayOffset: -9,
    timeOfDay: '11:00',
  },
  {
    labelTail: 'filter-coffee-launch',
    title: 'Filter coffee starts this week',
    body: 'South Indian filter coffee joins the counter this week at ₹40, brewed fresh through the day.',
    status: 'scheduled',
    channels: ['x', 'gbp', 'instagram'],
    origin: 'plan_week',
    dayOffset: 2,
    timeOfDay: '09:00',
  },
  {
    labelTail: 'raja-parba-offer',
    title: 'Raja Parba weekend offer',
    body: 'Raja Parba weekend: 15% off every Odia title, and podapitha with your second chai.',
    status: 'scheduled',
    channels: ['gbp', 'instagram'],
    origin: 'plan_week',
    dayOffset: 5,
    timeOfDay: '08:30',
  },
  {
    labelTail: 'staff-picks-july',
    title: 'July staff picks',
    body: 'Four staff picks for July, one from each of us, with a shelf card saying why.',
    status: 'draft',
    channels: ['x', 'instagram'],
    origin: 'manual',
    dayOffset: null,
    timeOfDay: null,
  },
  {
    labelTail: 'cuttack-heritage-walk',
    title: 'Heritage walk stop',
    body: 'The Sunday heritage walk through Buxi Bazaar now ends at our counter. Chai at ₹15 for walkers.',
    status: 'draft',
    channels: ['gbp'],
    origin: 'manual',
    dayOffset: null,
    timeOfDay: null,
  },
  {
    labelTail: 'exam-season-study-hours',
    title: 'Extended study hours',
    body: 'Through exam season we stay open till 11pm on weeknights, with the upstairs room kept quiet.',
    status: 'review',
    channels: ['x', 'gbp'],
    origin: 'manual',
    dayOffset: null,
    timeOfDay: null,
  },
]

export interface DemoVariant {
  post: string
  channel: Channel
  /** Written WITHOUT the hashtags; `composeBody` appends them per channel convention. */
  body: string
  /** Space-separated so the source stays readable; stored as an array in `extras`. */
  tags?: string
  ctaType?: string
  offer?: { title: string; terms: string }
  /** Omitted = true. False marks a variant hand-edited away from its parent body. */
  isLinked?: boolean
}

// Bodies are written per channel on purpose: X gets one idea under 280, GBP gets a plain
// local-business notice (what, when, where, no hashtags), Instagram gets the warmer, longer
// version with its hashtags at the end. One body copy-pasted across three channels would
// defeat the whole feature this demo exists to show.
export const DEMO_VARIANTS: readonly DemoVariant[] = [
  {
    post: 'monsoon-reading-list',
    channel: 'x',
    body: 'Rain since Tuesday, so the monsoon table is up. Ten slow books for wet afternoons, three of them Odia. Chai ₹20, window seat free until it stops.',
    tags: '#Cuttack #MonsoonReads',
  },
  {
    post: 'monsoon-reading-list',
    channel: 'gbp',
    body: 'Our monsoon reading table is now up at Chai & Chapters, Buxi Bazaar. Ten slow reads for wet afternoons, including Odia fiction, translated classics and two Mahanadi travel diaries. We are open 9am to 9pm every day through the rains. Masala chai is ₹20 and the reading room seats twelve.',
    ctaType: 'LEARN_MORE',
  },
  {
    post: 'monsoon-reading-list',
    channel: 'instagram',
    body: 'It has rained every afternoon this week, so we did the sensible thing and built a monsoon table by the window.\n\nTen slow books, three of them Odia, two travel diaries down the Mahanadi, and a stack of short stories for the days you only get twenty minutes.\n\nChai is ₹20. The window seat is free. Buxi Bazaar, 9am to 9pm.',
    tags: '#chaiandchapters #cuttack #monsoonreading #odialiterature #bookshopcafe #buxibazaar',
  },
  {
    post: 'new-arrival-odia-poetry',
    channel: 'x',
    body: 'New Odia poetry landed today. Ramakanta Rath back in stock, plus two young Cuttack poets we had to reorder twice. ₹150 to ₹320, front shelf.',
    tags: '#OdiaPoetry',
    isLinked: false,
  },
  {
    post: 'new-arrival-odia-poetry',
    channel: 'instagram',
    body: 'A poetry parcel came in this evening and we opened it at the counter, which is not how stock is meant to be received.\n\nRamakanta Rath is back on the shelf. So are two younger Cuttack poets whose first collections we had to reorder twice, because the first lot went in four days.\n\n₹150 to ₹320, front shelf, left of the counter.',
    tags: '#chaiandchapters #odiapoetry #cuttack #odialiterature #newarrivals #bookshopcafe',
  },
  {
    post: 'saturday-book-club',
    channel: 'gbp',
    body: 'Book club meets upstairs at Chai & Chapters every Saturday, 5pm to 6.30pm. This month we are reading Gopinath Mohanty, and you are welcome even if you are only halfway through. Joining is free. Chai is ₹20 and we keep twelve chairs, so tell us on the way in if you are bringing a friend.',
    ctaType: 'SIGN_UP',
  },
  {
    post: 'saturday-book-club',
    channel: 'x',
    body: 'Book club is upstairs every Saturday, 5pm. July book is Gopinath Mohanty. Come even if you are halfway through, most of us are. Free to join.',
    tags: '#Cuttack',
  },
  {
    post: 'filter-coffee-launch',
    channel: 'x',
    body: 'Filter coffee starts this week. ₹40, brewed through the day, and yes it comes in the steel tumbler. Chai is not going anywhere.',
    tags: '#Cuttack #FilterCoffee',
  },
  {
    post: 'filter-coffee-launch',
    channel: 'gbp',
    body: 'Filter coffee joins the counter at Chai & Chapters, Buxi Bazaar, from this week. ₹40 a cup, brewed fresh through the day and served in a steel tumbler. Masala chai stays at ₹20. The counter opens at 9am and the first brew is usually ready by 9.15am.',
    ctaType: 'ORDER',
  },
  {
    post: 'filter-coffee-launch',
    channel: 'instagram',
    body: 'We have been testing this one quietly for a month, mostly on regulars who were honest with us.\n\nFilter coffee joins the counter this week. ₹40, brewed through the day, steel tumbler, no debate about that. Masala chai stays exactly where it is at ₹20.\n\nFirst brew is ready around 9.15am. Bring a book.',
    tags: '#chaiandchapters #filtercoffee #cuttack #bookshopcafe #buxibazaar #coffeeandbooks',
  },
  {
    post: 'raja-parba-offer',
    channel: 'gbp',
    body: 'For Raja Parba weekend, every Odia title in the shop is 15% off and your second chai comes with podapitha on us. Chai & Chapters, Buxi Bazaar, open 9am to 9pm on all three days. The swing is up in the courtyard and yes, you may use it.',
    ctaType: 'ORDER',
    offer: {
      title: '15% off every Odia title',
      terms: 'Raja Parba weekend only, in store, on Odia language titles.',
    },
  },
  {
    post: 'raja-parba-offer',
    channel: 'instagram',
    body: 'Raja Parba weekend, and the shop smells like podapitha because it is.\n\nEvery Odia title is 15% off for all three days. Your second chai comes with podapitha on us. The swing is up in the courtyard and it is not only for the children, we have checked.\n\nBuxi Bazaar, 9am to 9pm.',
    tags: '#rajaparba #chaiandchapters #cuttack #odisha #odialiterature #podapitha',
  },
  {
    post: 'staff-picks-july',
    channel: 'x',
    body: 'July staff picks are on the front table. One book from each of us and a card saying why, which is harder to write than it sounds. From ₹180.',
    tags: '#StaffPicks',
  },
  {
    post: 'staff-picks-july',
    channel: 'instagram',
    body: 'Four of us work here, so there are four picks for July, and each of us had to write a card explaining the choice. That second part took longer than the choosing.\n\nSambit went with Odia short stories. Rashmi picked a Partition novel she will not stop talking about. All four are on the front table from ₹180.',
    tags: '#chaiandchapters #staffpicks #cuttack #bookshopcafe #julyreads #whattoread',
  },
  {
    post: 'cuttack-heritage-walk',
    channel: 'gbp',
    body: 'The Sunday morning heritage walk through Buxi Bazaar now finishes at Chai & Chapters. Walkers get chai at ₹15 and a table held from 8.30am. The walk starts at Barabati Fort at 6.30am and takes about two hours, so come hungry. Our shelf of Cuttack history books is by the door.',
    ctaType: 'LEARN_MORE',
  },
  {
    post: 'exam-season-study-hours',
    channel: 'x',
    body: 'Exam season, so we stay open till 11pm on weeknights. Upstairs stays quiet, plug points at every table, chai ₹20 with ₹10 refills. Good luck.',
    tags: '#Cuttack',
  },
  {
    post: 'exam-season-study-hours',
    channel: 'gbp',
    body: 'Through exam season Chai & Chapters stays open until 11pm, Monday to Friday. The upstairs room is kept quiet for studying, every table has a plug point, and masala chai refills are ₹10 after the first at ₹20. Buxi Bazaar, off Odia Bazaar road. Weekend hours stay 9am to 9pm.',
    ctaType: 'LEARN_MORE',
    isLinked: false,
  },
]

export const DEMO_MEDIA = [
  {
    post: 'monsoon-reading-list',
    index: 1,
    bytes: 412_338,
    width: 1600,
    height: 1200,
    alt: 'Ten books stacked on a window table with rain running down the glass behind them.',
  },
  {
    post: 'filter-coffee-launch',
    index: 1,
    bytes: 356_902,
    width: 1440,
    height: 1440,
    alt: 'A steel tumbler and davara of filter coffee beside an open book on a wooden counter.',
  },
] as const

export const MEDIA_MIME = 'image/jpeg'

/** The retry story the spec froze: book club's GBP post fails once, then succeeds. */
export const RETRY_POST = 'saturday-book-club'
export const RETRY_CHANNEL: Channel = 'gbp'
export const RETRY_ERROR = { code: 'RATE_LIMITED', message: 'GBP quota reached, retrying' }
