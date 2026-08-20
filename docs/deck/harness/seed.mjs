/**
 * Seed the LOCAL THROWAWAY pgbox with one believable Indian SMB.
 *
 * Sujata Bake House — a six-year-old neighbourhood bakery on 8th Cross,
 * Malleshwaram, Bengaluru. Sells daily bread and cake over the counter
 * (Instagram) and corporate festive hampers to nearby offices (LinkedIn).
 * That split is the whole reason the per-channel copy differs: the same event
 * is a warm sensory post to a neighbour and a lead-time-and-GST post to an
 * office admin.
 *
 * SAFETY: refuses to run against anything but 127.0.0.1/localhost.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const BOX = '/tmp/sahoda-pgbox-shots'
const SCRATCH =
  '/tmp/claude-1000/-home-divas-Documents-GitHub-sahodalabs/bba3e938-0904-498b-b8eb-82ebf7aa416b/scratchpad'
const require = createRequire(`${BOX}/noop.js`)
const { Client } = require('pg')

const URL_STR = process.env.SEED_PG_URL ?? 'postgres://postgres:postgres@127.0.0.1:54350/postgres'

// ── THE SAFETY GATE ─────────────────────────────────────────────────────────
// Positive proof, not inequality against one project ref: the host must BE
// loopback. Any remote host at all — Supabase or otherwise — stops the run.
const parsed = new URL(URL_STR)
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])
if (!LOOPBACK.has(parsed.hostname)) {
  console.error(`REFUSING: target host is "${parsed.hostname}", which is not loopback.`)
  process.exit(1)
}

const { clerkUserId } = JSON.parse(readFileSync(`${SCRATCH}/deck-user.json`, 'utf8'))

const db = new Client({ connectionString: URL_STR })
await db.connect()

// Prove, from the server's own mouth, which database this is.
const who = await db.query(
  `select current_database() db, inet_server_addr()::text addr, inet_server_port() port,
          current_setting('data_directory') datadir, version() v`,
)
console.log('── CONNECTED TO ──')
console.log('  database  :', who.rows[0].db)
console.log('  server    :', who.rows[0].addr ?? '(unix socket)', 'port', who.rows[0].port)
console.log('  data dir  :', who.rows[0].datadir)
console.log('  version   :', who.rows[0].v.split(',')[0])
if (!String(who.rows[0].datadir).startsWith('/tmp/')) {
  console.error('REFUSING: data directory is not under /tmp — this is not the throwaway box.')
  process.exit(1)
}
console.log('──────────────────\n')

// Re-runnable: drop any previous seed of this shop. Deleting the workspace
// cascades to every tenant table, so this is the single root.
await db.query(`delete from workspaces where slug = 'sujata-bake-house'`)
await db.query(`delete from users_profile where user_id = $1`, [clerkUserId])

// ── TIME ────────────────────────────────────────────────────────────────────
// A fixed anchor so a re-seed produces the same story.
const NOW = new Date('2026-08-20T11:30:00+05:30')
const day = (n, h = 9, m = 15) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + n)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

const WS = randomUUID()
const OWNER = clerkUserId

// ── IDENTITY ────────────────────────────────────────────────────────────────
await db.query(
  `insert into users_profile (user_id, email, display_name, prefs)
   values ($1,$2,$3,$4::jsonb)`,
  [
    OWNER,
    'sujata@sujatabakehouse.in',
    'Sujata Rao',
    JSON.stringify({ locale: 'en-IN', timezone: 'Asia/Kolkata' }),
  ],
)

await db.query(
  `insert into workspaces (id, name, slug, created_by, settings, created_at)
   values ($1,$2,$3,$4,$5::jsonb,$6)`,
  [
    WS,
    'Sujata Bake House',
    'sujata-bake-house',
    OWNER,
    JSON.stringify({
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      city: 'Bengaluru',
      locale: 'en-IN',
    }),
    day(-190),
  ],
)

await db.query(
  `insert into workspace_members (workspace_id, user_id, role, created_at) values ($1,$2,'owner',$3)`,
  [WS, OWNER, day(-190)],
)

// ── BRAND BRAIN ─────────────────────────────────────────────────────────────
// v1 payload + the per-field provenance map the Certainty ring counts.
// Eight of fifteen confirmed: a real brain in mid-flight, not a full one.
const CONFIRMED = [
  'hook.core_promise',
  'customer_persona.primary_pain_point',
  'voice.descriptor',
  'taboo.red_lines',
  'brand_persona.archetype',
  'customer_persona.one_liner',
  'voice.banned_phrases',
  'brand_persona.core_values',
]

const ALL_FIELDS = [
  ['hook.core_promise', 'asked'],
  ['customer_persona.primary_pain_point', 'asked'],
  ['voice.descriptor', 'negotiated'],
  ['taboo.red_lines', 'asked'],
  ['brand_persona.archetype', 'asked'],
  ['customer_persona.one_liner', 'asked'],
  ['voice.banned_phrases', 'negotiated'],
  ['hook.primary_emotion', 'asked'],
  ['brand_persona.one_liner', 'asked'],
  ['customer_persona.primary_fear', 'asked'],
  ['customer_persona.desired_identity', 'asked'],
  ['voice.signature_phrases', 'negotiated'],
  ['brand_persona.core_values', 'asked'],
  ['hook.sample_hooks', 'asked'],
  ['voice.formality_label', 'negotiated'],
]

const fieldMeta = {}
for (const [path, kind] of ALL_FIELDS) {
  fieldMeta[path] = CONFIRMED.includes(path)
    ? { kind, confirmed: true, source: 'owner' }
    : { kind, confirmed: false, source: 'model:brand_guidelines' }
}

const brainPayload = {
  voice: {
    descriptor:
      'Warm and unhurried, like a neighbour who already knows your usual order. Short sentences. Never sells hard — the bread does that.',
    formality_label: 'Friendly, never formal',
    signature_phrases: [
      'Baked this morning',
      'Come by before the tray empties',
      'Same starter since 2019',
    ],
    banned_phrases: ['artisanal', 'world-class', 'mouth-watering', 'guilt-free'],
  },
  brand_persona: {
    archetype: 'The Neighbour',
    one_liner: 'A small bakehouse that has fed the same lane for six years.',
    core_values: ['Fresh daily', 'Fair price', 'No shortcuts'],
  },
  customer_persona: {
    one_liner:
      'Families on 8th Cross who buy bread twice a week, and office admins around Malleshwaram who order hampers every October.',
    primary_pain_point: 'Bakery bread that is already stale by the second day.',
    primary_fear: 'Arriving at 6pm to find the shelf cleared.',
    desired_identity: 'The one in the family who always knows where the good stuff is.',
  },
  hook: {
    core_promise: 'Baked this morning, not last night.',
    primary_emotion: 'Comfort',
    sample_hooks: [
      'The 7am tray is out.',
      'We stop baking at 4. When it is gone, it is gone.',
      'Six years, one starter, same lane.',
    ],
  },
  taboo: {
    red_lines: [
      'Never call anything healthy — we are a bakery, not a clinic',
      'Never discount the day-old rack in a post',
      'Never claim anything is sugar-free',
    ],
  },
  alignment: {
    signal_lock: 'strong',
    note: 'Voice, red lines and the promise came from the owner directly. Persona detail and the sample hooks are still the model’s reading and have not been confirmed.',
  },
  field_meta: fieldMeta,
}

await db.query(
  `insert into brand_memory (workspace_id, version, status, payload, source, created_by, created_at)
   values ($1,1,'superseded',$2::jsonb,'resolved',$3,$4)`,
  [WS, JSON.stringify({ ...brainPayload, field_meta: {} }), OWNER, day(-96)],
)
await db.query(
  `insert into brand_memory (workspace_id, version, status, payload, source, created_by, created_at)
   values ($1,2,'active',$2::jsonb,'manual',$3,$4)`,
  [WS, JSON.stringify(brainPayload), OWNER, day(-31)],
)

// ── CONNECTIONS ─────────────────────────────────────────────────────────────
const IG_CONN = randomUUID()
const LI_CONN = randomUUID()

await db.query(
  `insert into connections (id, workspace_id, platform, status, external_account, scopes, created_by, created_at, last_checked_at)
   values ($1,$2,'instagram','active',$3::jsonb,$4,$5,$6,$7)`,
  [
    IG_CONN,
    WS,
    JSON.stringify({
      id: '64f1a2b3c4d5e6f7a8b9c0d1',
      profileId: '64f1a2b3c4d5e6f7a8b9c0d3',
      username: 'sujatabakehouse',
      displayName: 'Sujata Bake House',
      accountType: 'BUSINESS',
      followers: 2431,
    }),
    ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments'],
    OWNER,
    day(-142),
    day(-1, 6, 5),
  ],
)

await db.query(
  `insert into connections (id, workspace_id, platform, status, external_account, scopes, created_by, created_at, last_checked_at)
   values ($1,$2,'linkedin','active',$3::jsonb,$4,$5,$6,$7)`,
  [
    LI_CONN,
    WS,
    JSON.stringify({
      id: '64f1a2b3c4d5e6f7a8b9c0d2',
      profileId: '64f1a2b3c4d5e6f7a8b9c0d3',
      username: 'sujata-bake-house',
      displayName: 'Sujata Bake House',
      accountType: 'ORGANIZATION',
      followers: 611,
    }),
    ['w_member_social', 'r_organization_social'],
    OWNER,
    day(-88),
    day(-1, 6, 5),
  ],
)

await db.query(`insert into zernio_profiles (workspace_id, profile_id) values ($1,$2)`, [
  WS,
  '64f1a2b3c4d5e6f7a8b9c0d3',
])

// ── CAMPAIGN ────────────────────────────────────────────────────────────────
const CAMP = randomUUID()
await db.query(
  `insert into campaigns (id, workspace_id, name, objective, status, starts_at, ends_at, created_by, created_at)
   values ($1,$2,$3,$4,'active',$5,$6,$7,$8)`,
  [
    CAMP,
    WS,
    'Diwali hampers 2026',
    'Fill 200 corporate hamper boxes before the 12th, without running the counter dry.',
    day(-12),
    day(62),
    OWNER,
    day(-14),
  ],
)

const CAMP2 = randomUUID()
await db.query(
  `insert into campaigns (id, workspace_id, name, objective, status, starts_at, ends_at, created_by, created_at)
   values ($1,$2,$3,$4,'finished',$5,$6,$7,$8)`,
  [
    CAMP2,
    WS,
    'Onam sadya pre-orders',
    'Take payasam and sadya-box orders a week ahead so the kitchen is not guessing.',
    day(-58),
    day(-40),
    OWNER,
    day(-62),
  ],
)

// ── POSTS ───────────────────────────────────────────────────────────────────
// `variants` bodies are written per channel on purpose: Instagram speaks to the
// lane, LinkedIn speaks to an office admin who needs a lead time and an invoice.
const POSTS = [
  {
    key: 'hero',
    title: 'Diwali corporate hampers — bookings open',
    status: 'draft',
    created: day(-2, 8, 40),
    campaign: CAMP,
    media: 0, // deliberately none: Instagram's own rule flags it, LinkedIn's does not
    variants: {
      instagram: {
        body: `Diwali hampers are open. 🪔

Three sizes, all packed the morning they go out — not the week before, not in a warehouse. Shortbread, kaju rolls, the date-and-walnut loaf people ask for all year, and a celebration cake in the big box.

Last year we ran out by the 12th and turned away eleven families. This year there are 200 boxes and not one more.

Come to the counter or send us a message to hold one.

8th Cross, Malleshwaram. Open 7 to 8, closed Monday.`,
        hashtags: ['#malleshwaram', '#bengalurufood', '#diwaligifting', '#bakedfresh'],
        publish_status: 'pending',
      },
      linkedin: {
        body: `Corporate Diwali hampers — bookings now open for 2026.

We supply festive hampers to 40-odd offices around Malleshwaram, Rajajinagar and Yeshwanthpur. Everything is baked and packed the morning it ships, so we ask for five working days from confirmation. We do not pre-pack and store.

Three boxes:
· Small — ₹450. Shortbread, kaju roll, tea cake.
· Standard — ₹850. Adds the date-and-walnut loaf and savoury twists.
· Large — ₹1,400. Adds a 500g celebration cake.

Minimum order is 25 boxes. GST invoice provided. Custom sleeve branding is included above 100 boxes, and we can split delivery across two addresses at no extra charge.

One thing worth saying plainly: our kitchen caps at 200 boxes for the festive window and we will stop taking orders when it is full rather than push dates. Last year that happened on the 12th.

To book, write to orders@sujatabakehouse.in with your box count and delivery date.`,
        hashtags: [],
        publish_status: 'pending',
      },
    },
  },
  {
    key: 'packing',
    title: 'Festive hamper packing day',
    status: 'published',
    created: day(-9, 7, 10),
    published: day(-8, 10, 30),
    campaign: CAMP,
    media: 1,
    variants: {
      instagram: {
        body: `Packing day. Four of us, one long table, 60 boxes before lunch.

Meena does the ribbon because none of the rest of us can do it without it looking sad.`,
        hashtags: ['#malleshwaram', '#behindthecounter'],
        publish_status: 'published',
      },
      linkedin: {
        body: `Sixty hampers went out this morning to three offices in Rajajinagar.

For anyone planning festive gifting this year: the bottleneck is almost never the baking, it is the packing table. We can bake 200 boxes' worth in two nights. Packing, labelling and splitting them by floor takes a full day with four people.

If you are ordering for more than 100 staff, tell us the delivery date first and we will work backwards from it.`,
        hashtags: [],
        publish_status: 'published',
      },
    },
  },
  {
    key: 'millet',
    title: 'Millet bread lands Tuesday',
    status: 'published',
    created: day(-16, 8, 0),
    published: day(-15, 8, 30),
    media: 1,
    variants: {
      instagram: {
        body: `New from Tuesday: a ragi and jowar loaf.

Denser than the white, holds up to chutney, and it does not crumble in a lunchbox. We tested it on the 4pm regulars for three weeks before putting it on the board.

₹90. Twenty loaves a day to start.`,
        hashtags: ['#milletbread', '#ragi', '#malleshwaram', '#bengalurufood'],
        publish_status: 'published',
      },
    },
  },
  {
    key: 'starter',
    title: 'Six years of the same starter',
    status: 'published',
    created: day(-24, 7, 30),
    published: day(-23, 7, 45),
    media: 1,
    variants: {
      instagram: {
        body: `This jar is six years old today.

It came from a friend's kitchen in Jayanagar in 2019, and every sourdough we have sold since came out of it. It has moved shops once, survived two power cuts and one very bad week in 2021.

Same starter since 2019. That is the whole trick.`,
        hashtags: ['#sourdough', '#malleshwaram', '#sixyears'],
        publish_status: 'published',
      },
      linkedin: {
        body: `Six years ago this month we started with one sourdough starter, a borrowed oven and a counter on 8th Cross.

Today it is nine people, about 400 loaves a week, and a festive-hamper line that now feeds 40 offices.

We have said no to two franchise conversations. Not out of principle — because the thing customers actually pay us for is that everything is baked that morning in that kitchen, and we have not yet worked out how to be in two kitchens at once.`,
        hashtags: [],
        publish_status: 'published',
      },
    },
  },
  {
    key: 'onam',
    title: 'Onam payasam pre-orders',
    status: 'published',
    created: day(-49, 9, 0),
    published: day(-48, 9, 20),
    campaign: CAMP2,
    media: 1,
    variants: {
      instagram: {
        body: `Onam payasam, by pre-order only.

Ada pradhaman in 500ml and 1L. We make it once, on the morning of, and we make exactly as many as are ordered — so please book by Thursday.

₹280 and ₹520.`,
        hashtags: ['#onam', '#payasam', '#malleshwaram'],
        publish_status: 'published',
      },
    },
  },
  {
    key: 'tray',
    title: 'The 7am tray',
    status: 'published',
    created: day(-33, 6, 50),
    published: day(-33, 7, 5),
    media: 1,
    variants: {
      instagram: {
        body: `The 7am tray is out.

Butter croissants, khara buns, and the small cardamom rolls that go first every single day.

We stop baking at 4. When it is gone, it is gone.`,
        hashtags: ['#malleshwaram', '#bengalurubakery', '#morningbake'],
        publish_status: 'published',
      },
    },
  },
  {
    key: 'closed',
    title: 'Closed Monday 11 August',
    status: 'published',
    created: day(-11, 17, 0),
    published: day(-10, 18, 0),
    media: 0,
    variants: {
      instagram: {
        body: `Closed this Monday — the oven is being serviced.

Back Tuesday at 7 with the usual. If you need bread for Monday, pick it up Sunday evening; we will keep a few aside if you tell us today.`,
        hashtags: [],
        publish_status: 'published',
      },
      linkedin: {
        body: `We are closed Monday 11 August for annual oven servicing. Any hamper deliveries scheduled for Monday have been moved to Tuesday morning and the three affected offices have been called.

Normal service resumes Tuesday 7am.`,
        hashtags: [],
        publish_status: 'published',
      },
    },
  },
  {
    key: 'meena',
    title: 'Meena, five years on the counter',
    status: 'published',
    created: day(-40, 10, 0),
    published: day(-39, 11, 0),
    media: 1,
    variants: {
      instagram: {
        body: `Meena has been on our counter for five years.

She knows roughly 200 people's usual order, which regulars will wait for the 4pm batch, and exactly who to keep the last cardamom roll for.

If you have ever been handed your bread before you asked for it — that was her.`,
        hashtags: ['#behindthecounter', '#malleshwaram'],
        publish_status: 'published',
      },
      linkedin: {
        body: `Meena completed five years with us this week.

A small thing worth naming: our counter has had almost no turnover in six years, and that is the single biggest reason regulars keep coming. People do not come back for bread alone — they come back to be recognised.

For a business our size, retention on the floor is not an HR metric. It is the product.`,
        hashtags: [],
        publish_status: 'published',
      },
    },
  },
  {
    key: 'rain',
    title: 'Rain day, half the usual crowd',
    status: 'published',
    created: day(-27, 16, 0),
    published: day(-27, 16, 30),
    media: 1,
    variants: {
      instagram: {
        body: `It has been raining since 6 and the shop is half empty, so there is more left than usual at this hour.

Croissants, two millet loaves, and most of the khara buns. Come get them.`,
        hashtags: ['#bengalururains', '#malleshwaram'],
        publish_status: 'published',
      },
    },
  },
  {
    key: 'offsite',
    title: 'Breakfast boxes for offsites',
    status: 'failed',
    created: day(-5, 11, 0),
    media: 0,
    variants: {
      linkedin: {
        body: `Breakfast boxes for team offsites and early meetings.

₹190 a head: a savoury bun, a sweet roll, fruit, and filter coffee in a flask for the table. Minimum 15. We deliver anywhere within 6km of Malleshwaram by 8:30am if the order is confirmed the day before.

This started because one customer kept buying forty khara buns every second Friday and finally told us why.`,
        hashtags: [],
        publish_status: 'failed',
        error: {
          code: 'UPSTREAM_REJECTED',
          message:
            'LinkedIn refused this post as a duplicate of one published 4 minutes earlier. Nothing was posted twice. Edit the text or delete the earlier post, then retry.',
          platform_status: 422,
        },
      },
    },
  },
  {
    key: 'tricolour',
    title: 'Independence Day tea cake',
    status: 'published',
    created: day(-7, 8, 0),
    published: day(-5, 7, 30),
    media: 1,
    variants: {
      instagram: {
        body: `A tricolour tea cake for the 15th. Saffron, plain, and a pistachio-green layer that is actually pistachio.

Whole cake ₹520, slices at the counter from 8.`,
        hashtags: ['#independenceday', '#malleshwaram', '#teacake'],
        publish_status: 'published',
      },
    },
  },
  {
    key: 'ragi',
    title: 'Ragi cookies — the school-run box',
    status: 'scheduled',
    created: day(-3, 12, 0),
    scheduled: day(2, 8, 30),
    media: 1,
    variants: {
      instagram: {
        body: `Ragi cookies, back in the small box.

Parents kept asking for something for the 4pm school run that is not a biscuit packet. Twelve to a box, ₹160, and they last a week in a tin.`,
        hashtags: ['#ragi', '#malleshwaram', '#schoolrun'],
        publish_status: 'scheduled',
      },
    },
  },
  {
    key: 'sizes',
    title: 'Hamper sizes explained',
    status: 'scheduled',
    created: day(-2, 15, 0),
    scheduled: day(4, 10, 0),
    campaign: CAMP,
    media: 1,
    variants: {
      instagram: {
        body: `Three hamper sizes, side by side, so you can see what you are actually getting.

Small ₹450 · Standard ₹850 · Large ₹1,400. The big one has the celebration cake.`,
        hashtags: ['#diwaligifting', '#malleshwaram'],
        publish_status: 'scheduled',
      },
      linkedin: {
        body: `A question we get every October: what is actually in each hamper?

Small (₹450) — shortbread, kaju roll, tea cake. Good for a 200-person floor where the budget is per head.
Standard (₹850) — adds the date-and-walnut loaf and savoury twists. This is what most offices pick.
Large (₹1,400) — adds a 500g celebration cake. Usually for clients and senior gifting rather than staff.

Minimum 25 boxes, five working days' notice, GST invoice. Sleeve branding included above 100.`,
        hashtags: [],
        publish_status: 'scheduled',
      },
    },
  },
  {
    key: 'hiring',
    title: 'Hiring an evening baker',
    status: 'scheduled',
    created: day(-1, 9, 0),
    scheduled: day(6, 11, 0),
    media: 0,
    variants: {
      linkedin: {
        body: `We are hiring an evening baker.

3pm to 11pm, six days, Sundays off. You would run the overnight ferment and the 4am handover. Bread experience matters more than pastry; we will teach the pastry.

₹28,000–₹34,000 depending on what you walk in knowing, ESI and PF from day one, and one meal on every shift.

Walk in any afternoon between 2 and 4 and ask for Sujata, or write to work@sujatabakehouse.in.`,
        hashtags: [],
        publish_status: 'scheduled',
      },
    },
  },
  {
    key: 'modak',
    title: 'Ganesh Chaturthi modak orders',
    status: 'scheduled',
    created: day(-1, 14, 0),
    scheduled: day(9, 9, 0),
    media: 1,
    variants: {
      instagram: {
        body: `Modak orders open Friday.

Steamed ukadiche in dozens, and a baked version with the same filling for anyone taking them to an office. Book by the Wednesday before.`,
        hashtags: ['#ganeshchaturthi', '#modak', '#malleshwaram'],
        publish_status: 'scheduled',
      },
    },
  },
  {
    key: 'workshop',
    title: 'Sourdough workshop, first Sunday',
    status: 'draft',
    created: day(-4, 16, 30),
    media: 0,
    variants: {
      instagram: {
        body: `A sourdough morning, first Sunday of next month. Eight people, three hours, and you go home with a jar of our starter and a loaf you shaped yourself.

₹1,800. Booking opens at the counter on Monday.`,
        hashtags: ['#sourdough', '#workshop', '#malleshwaram'],
        publish_status: 'pending',
      },
    },
  },
  {
    key: 'why4',
    title: 'Why we stop baking at 4',
    status: 'review',
    created: day(-3, 18, 0),
    media: 0,
    variants: {
      instagram: {
        body: `People ask why we do not bake a second batch in the evening.

Because a 7pm loaf is a 7pm loaf, and by the time it is on the shelf it is competing with tomorrow's 7am one. We would rather sell out at 6 than sell you something we would not take home.

Baked this morning, not last night. That is the only promise we make.`,
        hashtags: ['#malleshwaram', '#bakedfresh'],
        publish_status: 'pending',
      },
    },
  },
  {
    key: 'terms',
    title: 'Bulk order terms for offices',
    status: 'approved',
    created: day(-6, 11, 30),
    campaign: CAMP,
    media: 0,
    variants: {
      linkedin: {
        body: `Our bulk terms, written down once so nobody has to ask.

· Minimum 25 boxes for hampers, 15 for breakfast boxes.
· Five working days from confirmed PO for festive hampers; next-day for breakfast boxes confirmed before 4pm.
· 50% advance on orders above ₹40,000. GST invoice on every order.
· Delivery free within 6km of Malleshwaram. Beyond that, at cost.
· We will decline an order we cannot bake fresh on the day rather than move it to a prior night.

That last line costs us business every October and we are keeping it.`,
        hashtags: [],
        publish_status: 'pending',
      },
    },
  },
]

const postIds = {}
const publishedPairs = [] // {postId, channel, publishedAt} — drives the metric curve

for (const p of POSTS) {
  const id = randomUUID()
  postIds[p.key] = id
  const channels = Object.keys(p.variants)

  await db.query(
    `insert into posts (id, workspace_id, title, body, status, channels, scheduled_at, origin, created_by, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,'manual',$8,$9)`,
    [
      id,
      WS,
      p.title,
      p.variants[channels[0]].body,
      p.status,
      channels,
      p.scheduled ?? null,
      OWNER,
      p.created,
    ],
  )

  for (const [channel, v] of Object.entries(p.variants)) {
    const vid = randomUUID()
    const tail = v.hashtags?.length ? `\n\n${v.hashtags.join(' ')}` : ''
    await db.query(
      `insert into post_variants
         (id, workspace_id, post_id, channel, body, extras, is_linked, char_count,
          publish_status, platform_post_id, permalink, last_error, format, version, created_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,false,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)`,
      [
        vid,
        WS,
        id,
        channel,
        v.body,
        JSON.stringify({ hashtags: v.hashtags ?? [] }),
        Array.from(v.body + tail).length,
        v.publish_status,
        v.publish_status === 'published' ? `${channel}_${id.slice(0, 8)}` : null,
        v.publish_status === 'published'
          ? channel === 'instagram'
            ? `https://www.instagram.com/p/${id.slice(0, 11)}/`
            : `https://www.linkedin.com/feed/update/urn:li:share:${id.slice(0, 12)}/`
          : null,
        v.error ? JSON.stringify(v.error) : null,
        p.media > 0 ? 'image' : 'text',
        v.publish_status === 'published' ? 2 : 1,
        p.created,
      ],
    )

    if (v.publish_status === 'published') {
      await db.query(
        `insert into post_publish_logs
           (workspace_id, post_id, variant_id, connection_id, channel, attempt, status, mode,
            platform_post_id, permalink, published_at, created_at)
         values ($1,$2,$3,$4,$5,1,'succeeded','live',$6,$7,$8,$8)`,
        [
          WS,
          id,
          vid,
          channel === 'instagram' ? IG_CONN : LI_CONN,
          channel,
          `${channel}_${id.slice(0, 8)}`,
          channel === 'instagram'
            ? `https://www.instagram.com/p/${id.slice(0, 11)}/`
            : `https://www.linkedin.com/feed/update/urn:li:share:${id.slice(0, 12)}/`,
          p.published,
        ],
      )
      publishedPairs.push({ postId: id, channel, publishedAt: new Date(p.published) })
    }

    if (v.publish_status === 'failed') {
      await db.query(
        `insert into post_publish_logs
           (workspace_id, post_id, variant_id, connection_id, channel, attempt, status, mode, error, created_at)
         values ($1,$2,$3,$4,$5,1,'failed','live',$6::jsonb,$7)`,
        [WS, id, vid, LI_CONN, channel, JSON.stringify(v.error), day(-5, 11, 12)],
      )
    }
  }

  if (p.campaign) {
    await db.query(
      `insert into campaign_posts (workspace_id, campaign_id, post_id) values ($1,$2,$3)`,
      [WS, p.campaign, id],
    )
  }
}

console.log(`posts: ${POSTS.length}, published post-channel pairs: ${publishedPairs.length}`)

// ── METRICS ─────────────────────────────────────────────────────────────────
/**
 * 60 days of snapshots with a shape a real small shop would have:
 * gentle growth, a monsoon dip, a genuinely FLAT week where nothing moved,
 * a festive lift, and day-of-week seasonality (weekends up, Monday closed).
 * Never a straight line, and never a number that implies a unicorn.
 */
function dayShape(i) {
  // i = 0..59, 0 being 59 days ago
  let m = 1 + i * 0.011 // slow underlying growth
  if (i >= 12 && i <= 19) m *= 0.72 // eight monsoon days, footfall and reach both down
  if (i >= 27 && i <= 33) m = 1.36 // the flat week — held, did not grow
  if (i >= 44 && i <= 50) m *= 1.24 // Independence Day + hamper announcement lift
  if (i === 38) m *= 0.55 // the Monday the oven was serviced
  return m
}
// A small deterministic wobble so no two days are identical.
function wobble(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return 0.88 + (x - Math.floor(x)) * 0.24
}

const METRIC_BASE = { impressions: 1, reach: 0.74, engagement: 0.061 }
let metricRows = 0

for (const pair of publishedPairs) {
  // A post accrues for 14 days, decaying — that is how a real feed post behaves.
  const chanScale = pair.channel === 'instagram' ? 1 : 0.34
  for (let d = 0; d < 14; d += 1) {
    const when = new Date(pair.publishedAt)
    when.setDate(when.getDate() + d)
    if (when > NOW) break
    const ageIndex = Math.round((when - NOW) / 86400000) + 59 // 0..59 across the window
    if (ageIndex < 0) continue
    const decay = d === 0 ? 1 : Math.max(0.06, 1 / (1 + d * 1.15))
    const dow = when.getDay()
    const seasonal = dow === 0 || dow === 6 ? 1.18 : dow === 1 ? 0.82 : 1
    const daily = 340 * dayShape(ageIndex) * decay * seasonal * chanScale * wobble(ageIndex * 7 + d)

    for (const [metric, factor] of Object.entries(METRIC_BASE)) {
      const value = Math.max(1, Math.round(daily * factor * wobble(d * 3 + metric.length)))
      await db.query(
        // measured_on is a GENERATED column — derived from measured_at, never inserted.
        `insert into post_metric_snapshots (workspace_id, post_id, channel, metric, value, measured_at)
         values ($1,$2,$3,$4,$5,$6::timestamptz)`,
        [WS, pair.postId, pair.channel, metric, value, when.toISOString()],
      )
      metricRows += 1
    }
  }
}
console.log(`metric snapshots: ${metricRows}`)

// ── INBOX ───────────────────────────────────────────────────────────────────
const THREADS = [
  {
    channel: 'instagram',
    kind: 'dm',
    author_name: 'Priya Nair',
    author_handle: '@priyanair',
    status: 'open',
    posted: day(-1, 19, 42),
    body: 'Hi! Do you take orders for a 1kg eggless chocolate cake for Sunday? And do you write on it?',
    messages: [
      {
        dir: 'inbound',
        at: day(-1, 19, 42),
        body: 'Hi! Do you take orders for a 1kg eggless chocolate cake for Sunday? And do you write on it?',
      },
      {
        dir: 'outbound',
        at: day(-1, 20, 15),
        body: 'Yes to both. 1kg eggless is ₹780 and writing is free. We need it confirmed by Friday evening so we can bake it Sunday morning rather than Saturday night. What name should go on it?',
      },
      {
        dir: 'inbound',
        at: day(-1, 20, 31),
        body: 'Perfect. “Appa” please. I’ll come by Friday to pay.',
      },
    ],
  },
  {
    channel: 'instagram',
    kind: 'comment',
    author_name: 'Rohan Shetty',
    author_handle: '@rohan.shetty',
    status: 'open',
    posted: day(-4, 12, 10),
    body: 'Is the millet loaf available on Sundays too or only Tuesday?',
    permalink: 'https://www.instagram.com/p/millet-loaf/',
    messages: [
      {
        dir: 'inbound',
        at: day(-4, 12, 10),
        body: 'Is the millet loaf available on Sundays too or only Tuesday?',
      },
    ],
  },
  {
    channel: 'gbp',
    kind: 'review',
    author_name: 'Lakshmi Venkatesh',
    author_handle: null,
    rating: 2,
    status: 'open',
    posted: day(-3, 9, 5),
    body: 'Been coming here for years and normally it is excellent. But I ordered a birthday cake for pickup at 5pm on Saturday and it was not ready until 5:40. Nobody called to tell me. We were late to our own party.',
    messages: [
      {
        dir: 'inbound',
        at: day(-3, 9, 5),
        body: 'Been coming here for years and normally it is excellent. But I ordered a birthday cake for pickup at 5pm on Saturday and it was not ready until 5:40. Nobody called to tell me. We were late to our own party.',
      },
    ],
  },
  {
    channel: 'gbp',
    kind: 'review',
    author_name: 'Arun Kumar',
    author_handle: null,
    rating: 5,
    status: 'resolved',
    posted: day(-13, 8, 20),
    body: 'The cardamom rolls are the reason I moved my morning walk route. Six years and it has never once been stale.',
    messages: [
      {
        dir: 'inbound',
        at: day(-13, 8, 20),
        body: 'The cardamom rolls are the reason I moved my morning walk route. Six years and it has never once been stale.',
      },
      {
        dir: 'outbound',
        at: day(-12, 9, 0),
        body: 'Thank you Arun — Meena says she recognised the description before she got to your name. See you at 7.',
      },
    ],
  },
  {
    channel: 'linkedin',
    kind: 'dm',
    author_name: 'Deepa Krishnan',
    author_handle: 'deepa-krishnan-hr',
    status: 'open',
    posted: day(-2, 15, 33),
    body: 'Hello — we are a 180-person office in Rajajinagar looking at Diwali gifting. Could you share pricing and whether you can do our logo on the box?',
    messages: [
      {
        dir: 'inbound',
        at: day(-2, 15, 33),
        body: 'Hello — we are a 180-person office in Rajajinagar looking at Diwali gifting. Could you share pricing and whether you can do our logo on the box?',
      },
      {
        dir: 'outbound',
        at: day(-2, 17, 5),
        body: 'Hello Deepa — for 180 boxes the Standard at ₹850 is what most offices your size take, and sleeve branding is included above 100 so the logo is no extra cost. We would need the artwork and a confirmed date five working days ahead. Shall I hold 180 for the week of the 5th?',
      },
    ],
  },
  {
    channel: 'instagram',
    kind: 'comment',
    author_name: 'Sneha Iyer',
    author_handle: '@snehaiyer',
    status: 'snoozed',
    snoozed_until: day(3, 10, 0),
    posted: day(-6, 18, 50),
    body: 'Please please bring back the coffee walnut cake 🙏',
    permalink: 'https://www.instagram.com/p/tea-cake/',
    messages: [
      {
        dir: 'inbound',
        at: day(-6, 18, 50),
        body: 'Please please bring back the coffee walnut cake 🙏',
      },
    ],
  },
  {
    channel: 'instagram',
    kind: 'question',
    author_name: 'Faiza Rahman',
    author_handle: '@faiza.r',
    status: 'open',
    posted: day(-1, 8, 12),
    body: 'What time do the khara buns usually finish? I keep missing them.',
    messages: [
      {
        dir: 'inbound',
        at: day(-1, 8, 12),
        body: 'What time do the khara buns usually finish? I keep missing them.',
      },
    ],
  },
]

let msgCount = 0
for (const t of THREADS) {
  const tid = randomUUID()
  await db.query(
    `insert into inbox_threads
       (id, workspace_id, channel, kind, platform_thread_id, author_name, author_handle, rating,
        body, permalink, status, snoozed_until, posted_at, first_seen_at, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$13)`,
    [
      tid,
      WS,
      t.channel,
      t.kind,
      `th_${tid.slice(0, 12)}`,
      t.author_name,
      t.author_handle ?? null,
      t.rating ?? null,
      t.body,
      t.permalink ?? null,
      t.status,
      t.snoozed_until ?? null,
      t.posted,
    ],
  )
  for (const m of t.messages) {
    await db.query(
      `insert into inbox_messages
         (workspace_id, thread_id, direction, body, platform_message_id, sent_at, author_user_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$6)`,
      [
        WS,
        tid,
        m.dir,
        m.body,
        `msg_${randomUUID().slice(0, 12)}`,
        m.at,
        m.dir === 'outbound' ? OWNER : null,
      ],
    )
    msgCount += 1
  }
}
console.log(`inbox: ${THREADS.length} threads, ${msgCount} messages`)

// ── ASSETS ──────────────────────────────────────────────────────────────────
const ASSETS = [
  [
    'morning-tray-7am.jpg',
    'The 7am tray on the counter, croissants in front',
    'Morning tray',
    1600,
    1200,
    486_233,
  ],
  [
    'hamper-three-sizes.jpg',
    'The three Diwali hamper boxes side by side',
    'Hamper sizes',
    1440,
    1440,
    712_904,
  ],
  [
    'starter-jar-2019.jpg',
    'The six-year-old sourdough starter jar on a windowsill',
    'Starter jar',
    1200,
    1500,
    402_118,
  ],
  [
    'millet-loaf-sliced.jpg',
    'Ragi and jowar loaf, sliced, on a wooden board',
    'Millet loaf',
    1800,
    1200,
    551_770,
  ],
  [
    'meena-counter.jpg',
    'Meena behind the counter wrapping bread',
    'Meena at the counter',
    1350,
    1080,
    388_402,
  ],
  [
    'packing-table.jpg',
    'Four people packing hamper boxes at a long table',
    'Packing day',
    2000,
    1333,
    921_556,
  ],
  [
    'tricolour-cake.jpg',
    'Tricolour tea cake with one slice cut',
    'Tricolour tea cake',
    1080,
    1080,
    297_640,
  ],
  [
    'shopfront-8th-cross.jpg',
    'The shopfront on 8th Cross in the early morning',
    'Shopfront',
    1920,
    1080,
    655_301,
  ],
]
for (const [file, alt, title, w, h, bytes] of ASSETS) {
  await db.query(
    `insert into assets (workspace_id, storage_path, kind, mime, bytes, width, height, alt, title, created_by, created_at)
     values ($1,$2,'image','image/jpeg',$3,$4,$5,$6,$7,$8,$9)`,
    [
      WS,
      `${WS}/library/${file}`,
      bytes,
      w,
      h,
      alt,
      title,
      OWNER,
      day(-45 + ASSETS.indexOf(ASSETS.find((a) => a[0] === file)) * 4),
    ],
  )
}
console.log(`assets: ${ASSETS.length}`)

// ── PLANNER ─────────────────────────────────────────────────────────────────
const EVENTS = [
  ['festival', 'Ganesh Chaturthi — modak orders close', day(7, 0, 0), true],
  ['festival', 'Onam', day(-45, 0, 0), true],
  ['note', 'Oven service — shop closed', day(-10, 0, 0), true],
  ['custom', 'Hamper artwork deadline for bulk orders', day(11, 17, 0), false],
  ['festival', 'Diwali', day(64, 0, 0), true],
  ['note', 'Sourdough workshop — first Sunday', day(14, 9, 0), false],
]
for (const [kind, title, at, allDay] of EVENTS) {
  await db.query(
    `insert into planner_events (workspace_id, kind, title, starts_at, all_day) values ($1,$2,$3,$4,$5)`,
    [WS, kind, title, at, allDay],
  )
}
console.log(`planner events: ${EVENTS.length}`)

// ── BILLING ─────────────────────────────────────────────────────────────────
await db.query(
  `insert into subscriptions (workspace_id, plan_id, status, provider, current_period_start, current_period_end, created_at)
   values ($1,'growth','active','cashfree',$2,$3,$2)`,
  [WS, day(-14), day(16)],
)

/** Every credit movement goes through the ledger function — never a raw insert. */
async function ledger(type, amount, opts = {}) {
  await db.query(`select app.apply_ledger_entry($1,$2,$3,$4,$5,$6,$7,$8,null,null,$9,$10::jsonb)`, [
    WS,
    type,
    amount,
    opts.key ?? `seed_${randomUUID()}`,
    opts.action ?? null,
    opts.ref ?? null,
    opts.tier ?? null,
    opts.cogs ?? null,
    opts.actor ?? OWNER,
    JSON.stringify(opts.meta ?? {}),
  ])
}

await ledger('GRANT', 100, { key: 'seed_signup_grant', action: 'signup_grant', actor: 'system' })
await ledger('GRANT', 5000, { key: 'seed_growth_cycle_1', action: 'plan_cycle', actor: 'system' })

const SPENDS = [
  ['brand_guidelines', 40, 'pro', 0.0182],
  ['caption_generate', 8, 'standard', 0.0021],
  ['caption_generate', 8, 'standard', 0.0019],
  ['channel_rewrite', 6, 'standard', 0.0014],
  ['image_generate', 60, 'image', 0.041],
  ['caption_generate', 8, 'standard', 0.0022],
  ['channel_rewrite', 6, 'standard', 0.0013],
  ['inbox_reply_draft', 5, 'standard', 0.0011],
  ['caption_generate', 8, 'standard', 0.002],
  ['image_generate', 60, 'image', 0.0398],
  ['weekly_summary', 12, 'standard', 0.0034],
  ['caption_generate', 8, 'standard', 0.0021],
  ['inbox_reply_draft', 5, 'standard', 0.001],
  ['channel_rewrite', 6, 'standard', 0.0015],
]
for (let i = 0; i < SPENDS.length; i += 1) {
  const [action, amount, tier, cogs] = SPENDS[i]
  await ledger('DEBIT', amount, {
    key: `seed_debit_${i}`,
    action,
    tier,
    cogs,
    ref: `post:${Object.values(postIds)[i % Object.values(postIds).length]}`,
  })
}

await ledger('TOPUP', 2000, {
  key: 'seed_topup_1',
  action: 'topup',
  meta: { provider: 'cashfree', order_id: 'ord_sujata_00417', amount_inr: 599 },
})
await ledger('GRANT', 250, {
  key: 'seed_perf_reward',
  action: 'referral_bonus',
  actor: 'system',
  meta: { reason: 'Referred one workspace that reached its first publish.' },
})

const bal = await db.query(
  `select balance_total, balance_held from credit_balances where workspace_id=$1`,
  [WS],
)
console.log(`credits: total ${bal.rows[0].balance_total}, held ${bal.rows[0].balance_held}`)

// ── TEMPLATES ───────────────────────────────────────────────────────────────
const TEMPLATES = [
  [
    'Daily bake announcement',
    'instagram',
    'The {time} tray is out.\n\n{items}\n\nWe stop baking at 4. When it is gone, it is gone.',
  ],
  [
    'Pre-order close reminder',
    'instagram',
    '{item} orders close {day}. We make exactly as many as are booked, so please tell us by then.',
  ],
  [
    'Bulk enquiry reply',
    'linkedin',
    'Thank you for writing in. For {count} boxes the {size} at ₹{price} is what most offices your size take. We need {lead} working days from a confirmed date. GST invoice provided.',
  ],
]
for (const [name, channel, body] of TEMPLATES) {
  await db.query(
    `insert into templates (workspace_id, name, channel, body, created_by) values ($1,$2,$3,$4,$5)`,
    [WS, name, channel, body, OWNER],
  )
}

console.log('\n── SEEDED ──')
console.log('workspace id  :', WS)
console.log('clerk user id :', OWNER)
console.log('hero post id  :', postIds.hero)
await db.end()
