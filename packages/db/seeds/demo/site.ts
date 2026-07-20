import {
  LeadInsertSchema,
  LeadStatusSchema,
  SiteInsertSchema,
  SitePageInsertSchema,
  SiteSectionInsertSchema,
  SiteStatusSchema,
  type Jsonb,
  type LeadStatus,
  type SectionKind,
} from '@sahoda/shared'
import type { SeedCtx, SeedModule, SeedTableResult } from './context'
import { at, minutesFrom } from './time'

const SITE_NAME = 'Chai & Chapters'
const SITE_GOAL = 'Turn book buyers into weekday afternoon regulars on the cafe side.'

/** One physical shop, so both contact sections point at the same address and form. */
const SHOP_ADDRESS = {
  line1: 'Second lane off College Square',
  line2: 'Buxi Bazaar, Cuttack',
  postalCode: '753001',
  state: 'Odisha',
  phone: '+91 90000 10001',
  hours: 'Open 9am to 9pm, every day',
}

const CONTACT_FIELDS = [
  { name: 'name', label: 'Your name', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'phone', label: 'Phone', type: 'tel', required: false },
  { name: 'message', label: 'What do you need?', type: 'textarea', required: true },
]

/**
 * Key order is render order: `sort` is the entry's index, so this reads top to bottom the
 * way the page does. `features` and `faq` share one `{ title, body }` item shape on
 * purpose, so the preview renderer drives both from a single list component.
 */
const HOME_SECTIONS: Partial<Record<SectionKind, Jsonb>> = {
  hero: {
    headline: 'Books on one side, hot chai on the other',
    sub: 'A small bookshop and cafe on the second lane off College Square, Cuttack. Doors open at 9am, every day.',
    cta: { label: 'Find the shop', href: '#contact' },
  },
  features: {
    headline: 'What you get for the walk down the lane',
    items: [
      { title: 'Odia and English titles', body: 'Poetry, fiction and school books, one shelf.' },
      { title: 'Masala chai from 9am', body: '₹20 a glass, poured through the day.' },
      { title: 'Study tables upstairs', body: 'Quiet on weekday afternoons, no minimum order.' },
      { title: 'Book club, Saturday 5pm', body: 'One book a month, free, twelve chairs only.' },
    ],
  },
  offer: {
    headline: 'Weekday reader plate, ₹90',
    sub: 'Buy any book from Monday to Friday and add a masala chai with a plate of pakhala for ₹90 until 4pm.',
    cta: { label: 'See what is on this week', href: '/events' },
    terms: 'Dine in only, one plate per bill. Pakhala runs through the summer months.',
  },
  testimonials: {
    headline: 'What the regulars say',
    quotes: [
      { quote: 'Came in for one book, stayed three hours.', attribution: 'Ipsita M., Buxi Bazaar' },
      { quote: 'The book club gives my Saturdays a shape.', attribution: 'Debasis P., Ranihat' },
      { quote: 'My son studies upstairs, I read downstairs.', attribution: 'Sunita R., parent' },
    ],
  },
  faq: {
    headline: 'Before you come',
    items: [
      { title: 'Where exactly are you?', body: 'Second lane off College Square, blue shutter.' },
      { title: 'What time do you open?', body: '9am every day. The kitchen starts at 9.30am.' },
      { title: 'Can I sit and study?', body: 'Yes, upstairs, weekday afternoons, no minimum.' },
      { title: 'Do you order books in?', body: 'Odia titles in four days, English in two weeks.' },
      { title: 'Is the book club free?', body: 'Yes. Saturdays at 5pm, borrow the shop copy.' },
    ],
  },
  contact: {
    headline: 'Ask us anything',
    sub: 'Book orders, study tables, club dates. We read this every morning before opening.',
    fields: CONTACT_FIELDS,
    address: SHOP_ADDRESS,
  },
}

const EVENTS_SECTIONS: Partial<Record<SectionKind, Jsonb>> = {
  hero: {
    headline: 'Events at Chai & Chapters',
    sub: 'Book club, poetry evenings and a Sunday reading hour. Small rooms, small groups, mostly free.',
    cta: { label: 'Ask about a date', href: '#contact' },
  },
  features: {
    headline: 'What runs every month',
    items: [
      { title: 'Book club, Saturday 5pm', body: 'Odia and English alternating. Reach by 4.45pm.' },
      { title: 'Poetry evening, last Friday', body: 'Odia open mic, five minute slots, chai ₹20.' },
      { title: 'Reading hour, Sunday 11am', body: 'Ages five to ten. Free, tell us in advance.' },
    ],
  },
  contact: {
    headline: 'Book the upstairs room',
    sub: 'Tell us the date and how many people are coming. We reply the same day.',
    fields: CONTACT_FIELDS,
    address: SHOP_ADDRESS,
  },
}

/** `key` is the tail of the frozen id labels `page.<key>` and `section.<key>.<kind>`. */
const PAGES = [
  {
    key: 'home',
    path: '/',
    title: SITE_NAME,
    seo: {
      title: 'Chai & Chapters | Bookshop and cafe in Cuttack',
      description: 'Odia and English books, chai and a reading room, off College Square, Cuttack.',
      ogImage: 'demo/chai-and-chapters/og-home.jpg',
      canonical: '/',
    },
    sections: HOME_SECTIONS,
  },
  {
    key: 'events',
    path: '/events',
    title: 'Events at Chai & Chapters',
    seo: {
      title: 'Events at Chai & Chapters | Book club and poetry evenings',
      description: 'Saturday book club at 5pm, Odia poetry open mic, Sunday reading hour.',
      ogImage: 'demo/chai-and-chapters/og-events.jpg',
      canonical: '/events',
    },
    sections: EVENTS_SECTIONS,
  },
]

/** `readAfter` = minutes between arrival and the owner opening it; null means unread. */
const LEADS = [
  {
    slug: 'priyanka-book-club',
    name: 'Priyanka Mohanty',
    email: 'priyanka.demo@example.com',
    phone: '+91 90000 20001',
    message:
      'Namaskar, I want to join the Saturday book club. Is there space this month, and must I buy the book from the shop?',
    status: 'contacted',
    dayOffset: -5,
    time: '20:15',
    readAfter: 780,
    page: '/events',
    utm: { source: 'instagram', medium: 'social', campaign: 'saturday-book-club' },
    extra: { heardFrom: 'Instagram', preferredLanguage: 'Odia' },
  },
  {
    slug: 'sameer-bulk-order',
    name: 'Sameer Panda',
    email: 'sameer.demo@example.com',
    phone: '+91 90000 20002',
    message:
      'We need 60 copies of the Class 8 Odia reader for our school by month end. Can you quote a price and confirm delivery to Chauliaganj?',
    status: 'new',
    dayOffset: -1,
    time: '11:40',
    readAfter: null,
    page: '/',
    utm: { source: 'google', medium: 'organic', campaign: 'none' },
    extra: { organisation: 'Chauliaganj High School', quantity: 60, needBy: 'end of month' },
  },
  {
    slug: 'anjali-event-space',
    name: 'Anjali Sahoo',
    email: 'anjali.demo@example.com',
    phone: '+91 90000 20003',
    message:
      'We are planning a poetry evening for about 30 people and want the upstairs room on a Friday. What do you charge, and can we bring our own snacks?',
    status: 'won',
    dayOffset: -12,
    time: '17:05',
    readAfter: 45,
    page: '/events',
    utm: { source: 'gbp', medium: 'referral', campaign: 'events-page' },
    extra: { guests: 30, occasion: 'Odia poetry evening', bringingOwnSnacks: true },
  },
] as const satisfies readonly (Record<string, unknown> & { status: LeadStatus })[]

/** Dependents build lead ids through this, so the `lead.<slug>` label exists in one place. */
export function leadId(ctx: Pick<SeedCtx, 'id'>, slug: string): string {
  return ctx.id(`lead.${slug}`)
}

/**
 * The `on conflict do update set` clause is derived from the row keys, so a column added to
 * the insert can never be dropped from the update and make a re-run drift. Only identifiers
 * interpolate; values all bind, and a null jsonb stays SQL NULL rather than the literal `null`.
 */
async function upsert(
  ctx: SeedCtx,
  table: string,
  id: string,
  row: Readonly<Record<string, unknown>>,
  jsonb: readonly string[] = [],
): Promise<void> {
  const columns = ['id', ...Object.keys(row)]
  const placeholders = columns.map((c, i) => `$${i + 1}${jsonb.includes(c) ? '::jsonb' : ''}`)
  const updates = columns.slice(1).map((c) => `${c} = excluded.${c}`)
  const values = [id, ...Object.values(row)].map((value, i) =>
    jsonb.includes(columns[i]!) && value !== null ? JSON.stringify(value) : value,
  )
  await ctx.sql(
    `insert into ${table} (${columns.join(', ')}) values (${placeholders.join(', ')})
     on conflict (id) do update set ${updates.join(', ')}`,
    values,
  )
}

export const seedSite: SeedModule = async (ctx): Promise<readonly SeedTableResult[]> => {
  const siteId = ctx.id('site')
  const site = SiteInsertSchema.parse({
    workspace_id: ctx.workspaceId,
    name: SITE_NAME,
    // sites.slug is globally unique, so it has to be namespace-derived: two demo runs
    // under different namespaces must never fight over the same subdomain.
    slug: ctx.slug,
    goal: SITE_GOAL,
    created_by: ctx.ownerId,
  })
  // Cloudflare deploy is deferred in the product, so a 'published' status carrying a
  // live-looking {slug}.sahoda.site URL would be a mock-success state: the demo would
  // advertise a page nobody can open. This site renders in the in-app preview, which is
  // what the demo actually shows, so it stays a draft with no deploy record. `theme` is
  // null for a different reason: the workspace theme carries the look.
  await upsert(ctx, 'sites', siteId, {
    ...site,
    status: SiteStatusSchema.parse('draft'),
    theme: null,
    deploy: null,
    last_deployed_at: null,
  })

  let sectionRows = 0
  for (const [pageSort, page] of PAGES.entries()) {
    const pageId = ctx.id(`page.${page.key}`)
    const pageRow = SitePageInsertSchema.parse({
      workspace_id: ctx.workspaceId,
      site_id: siteId,
      path: page.path,
      title: page.title,
      sort: pageSort,
      seo: page.seo,
    })
    await upsert(ctx, 'site_pages', pageId, pageRow, ['seo'])

    for (const [sort, [kind, content]] of Object.entries(page.sections).entries()) {
      const sectionRow = SiteSectionInsertSchema.parse({
        workspace_id: ctx.workspaceId,
        page_id: pageId,
        kind,
        sort,
        content,
      })
      const label = `section.${page.key}.${kind}`
      await upsert(ctx, 'site_sections', ctx.id(label), sectionRow, ['content'])
      sectionRows += 1
    }
  }

  for (const lead of LEADS) {
    const { name, email, phone, message } = lead
    // `payload` is the raw form submission, so it repeats the promoted columns verbatim.
    const submitted = { name, email, phone, message }
    const leadRow = LeadInsertSchema.parse({
      workspace_id: ctx.workspaceId,
      site_id: siteId,
      ...submitted,
      payload: { ...submitted, ...lead.extra },
      source: { form: 'contact', page: lead.page, utm: lead.utm, demo: true },
    })
    // created_at is set explicitly rather than left to now(): the inbox sorts by arrival,
    // and three leads stamped at the same instant tell no story at all.
    const createdAt = at(ctx.now, lead.dayOffset, lead.time)
    const readAt = lead.readAfter === null ? null : minutesFrom(createdAt, lead.readAfter)
    const row = {
      ...leadRow,
      status: LeadStatusSchema.parse(lead.status),
      read_at: readAt === null ? null : readAt.toISOString(),
      created_at: createdAt.toISOString(),
    }
    await upsert(ctx, 'leads', leadId(ctx, lead.slug), row, ['payload', 'source'])
  }

  ctx.log(`site ${ctx.slug} seeded as a draft (in-app preview only, nothing deployed)`)

  return [
    { table: 'sites', rows: 1 },
    { table: 'site_pages', rows: PAGES.length },
    { table: 'site_sections', rows: sectionRows },
    { table: 'leads', rows: LEADS.length },
  ]
}
