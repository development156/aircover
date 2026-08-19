# Data schema

The complete shape of `DB` as TypeScript. This is the **contract your API must
satisfy** — `js/data.js` is fake, but its structure is the specification.

Fields marked **⚠** are ones the UI genuinely cannot work without or cannot fake.

---

## Shared types

```ts
/** Must match a key in BRAND_PNG or BRAND (js/icons.js). */
type PlatformKey =
  | 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube' | 'x'
  | 'whatsapp'  | 'telegram' | 'googleads' | 'metaads' | 'shopify'
  | 'googleanalytics' | 'searchconsole' | 'googlebusiness' | 'email' | 'website';

type Priority = 'High' | 'Medium' | 'Low';
type Stage    = 'Ideas' | 'Draft' | 'Review' | 'Scheduled' | 'Published';

/** Pre-formatted for display. The UI does no number formatting or i18n. */
type Display  = string;   // '18.2K' · '₹24.8K' · '4.2x' · '2 min ago'
```

**A deliberate decision:** display values arrive **pre-formatted as strings**.
Currency symbols, unit suffixes and relative times are the server's job. This
keeps locale and rounding rules in one place instead of scattered through
templates — but it means your API must format, not just serialise.

---

## Root

```ts
interface DB {
  user:          User;
  workspace:     Workspace;
  workspaces:    Workspace[];
  credits:       Credits;

  metrics:       Metric[];          // KPI row — Home + Analytics
  score:         { value: number; label: string };

  approvals:     Approval[];
  activity:      ActivityItem[];
  events:        PlannerEvent[];
  week:          WeekDay[];

  brand:         Brand;
  connections:   Connection[];
  campaigns:     Campaign[];
  channelPerf:   ChannelPerf[];
  insights:      Insight[];

  conversations: Conversation[];
  thread:        Message[];
  assets:        Asset[];
  notifications: Notification[];

  team:          TeamMember[];
  invoices:      Invoice[];
  creditUse:     CreditUse[];

  revenueSeries: number[];          // chart data, 14 points
  reachSeries:   number[];
  convSeries:    number[];
  engageSeries:  number[];
}
```

---

## Identity

```ts
interface User {
  name: string;          // 'Meera Patnaik'
  short: string;         // 'Meera'  — used in greetings
  initials: string;      // 'MP'     — avatar fallback
  role: string;          // 'Workspace Admin'
  email: string;
  tz: string;
  lang: string;
}

interface Workspace {
  name: string;
  location: string;
  initial: string;       // single character for the avatar tile
}

interface Credits {
  used: number;
  total: number;
  left: number;          // getter in the mock; a plain number is fine
  refill: Display;       // '1 Aug 2026'
}
```

---

## Approvals ⚠ (the highest-value contract)

```ts
interface Approval {
  id: string;
  platform: PlatformKey;
  kind: 'Post' | 'Story' | 'Campaign' | 'Broadcast' | 'Ad';
  title: string;
  desc: string;

  priority: Priority;    // ⚠ drives the status ladder rung
  due: Display;          // ⚠ human text — 'Due in 3h', 'Due tomorrow'
  dueSort: number;       // ⚠ hours until due. THE QUEUE SORTS ON THIS.
  status: 'pending' | 'approved' | 'rejected';

  progress: number;      // 0–100, shown as a ring
  reach: Display;        // '~74K'
  credits: number;

  ai: string;            // ⚠ the reasoning shown inline. NOT OPTIONAL.

  caption: string;       // supports \n — rendered with white-space: pre-wrap
  audience: string;
  schedule: Display;
  predict: { reach: Display; engage: Display; conv: Display };
}
```

**Why `dueSort` matters.** `due` is human text and cannot be sorted. The review
queue is ordered by `dueSort` ascending, and the whole rapid-review flow assumes
"next" means "next most urgent". Without it the queue is arbitrary.

**Why `ai` is not optional.** The reasoning line is what makes an approval
reviewable without opening it. An empty string produces a row that says "trust
me" — which defeats the purpose of a supervision surface.

---

## Connections ⚠ (three states, not a boolean)

```ts
interface Connection {
  k: PlatformKey;    // ⚠ must match the icon map
  group: 'Social' | 'Advertising' | 'Commerce' | 'Messaging' | 'Analytics';
  status: 'connected' | 'disconnected' | 'error';   // ⚠ three states
  sync: Display;         // '2 min ago' | '—'
  account: string;       // '@sunrisedental' | '—'
  err?: string;
}
```

| Status | Meaning | Treatment |
|---|---|---|
| `connected` | Working | Calm — rung 4, grey outline + ✓ |
| `error` | **Worked before, broken now.** Publishing is paused. | Loud — rung 1, solid orange + `!`, page-level banner, mascot turns red |
| `disconnected` | Never set up | Neutral — an invitation, not an alarm |

Collapsing this to a boolean removes the page's entire purpose. `error` is an
incident; `disconnected` is a to-do. They must not look alike.

---

## Campaigns

```ts
interface Campaign {
  id: string;
  name: string;
  status: 'Active' | 'Draft' | 'Completed';
  objective: 'Awareness' | 'Traffic' | 'Engagement' | 'Leads' | 'Sales';
  channels: PlatformKey[];
  dates: Display;        // '1 Jul – 31 Jul' | 'Starts 15 Aug'
  budget: number;        // raw — the UI formats this one with toLocaleString
  spent: number;         // raw
  reach: Display;
  conv: number;
  revenue: Display;
  roas: Display;
  health: number;        // 0–100, the AI readiness score
}
```

`budget`/`spent` are the exception to the pre-formatted rule: they are raw
numbers because the UI computes a spend ratio bar and a daily-spend estimate.

---

## Analytics

```ts
interface Metric {
  k: string;
  label: string;
  value: Display;        // '18.2K'
  delta: number;         // 12.5
  dir: 'up' | 'down';    // ⚠ direction comes from this, never from colour
  spark: number[];       // 12 points
}

interface ChannelPerf {
  k: PlatformKey;
  reach: Display;
  eng: Display;          // '5.2%'
  conv: number;
  rev: Display;
  share: number;         // 0–100, share of revenue
}

interface Insight {
  t: string;             // headline
  d: string;             // evidence
  rec: string;           // ⚠ the recommendation
  act: string;           // ⚠ the button label — every insight ends in an action
}
```

An insight without `rec` and `act` is a fact, not an insight. The page's premise
is that analytics are actionable; a dead-end observation breaks it.

---

## Planner

```ts
interface PlannerEvent {
  d: number;             // day of month
  platform: PlatformKey;
  kind: string;          // 'Post' | 'Story' | 'Campaign' | 'Broadcast' | …
  time: Display;         // '10:00 AM'
  title: string;
  stage: Stage;          // ⚠ the kanban column
}

interface WeekDay {
  day: string;           // 'Mon'
  date: Display;         // '4 Aug'
  today?: boolean;
  items: { platform: PlatformKey; kind: string; time: Display }[];
}
```

**Conflict detection** compares `d` + `time` + `platform`. Two posts on the same
channel at the same hour raise a decision dialog rather than resolving silently.

---

## Brand Brain

```ts
interface Brand {
  completeness: number;          // 0–100
  voice: string;
  style: string;
  color: string;                 // hex, shown as a value
  audience: Display;
  competitors: number;
  docs: number;

  mission: string;
  positioning: string;
  description: string;

  tone: { formal: number; playful: number; detail: number };   // 0–100 sliders
  traits: string[];
  example: string;               // "how the AI would write this"
  typography: { heading: string; body: string };
  colors: string[];              // the palette swatches

  aud: {
    age: Display; location: string; income: string;
    interests: string[]; pains: string[]; goals: string[];
    behaviour: string;
  };

  rivals: {
    name: string; pos: string; strength: string; weak: string;
    activity: 'High' | 'Medium' | 'Low'; posts: number;
  }[];

  knowledge: {
    name: string; cat: string; size: Display;
    indexed: boolean;            // ⚠ drives the Indexed / Indexing badge
    when: Display;
  }[];
}
```

---

## Conversations

```ts
interface Conversation {
  id: string;
  name: string;
  platform: PlatformKey;
  last: string;
  time: Display;         // '2m'
  unread: number;        // ⚠ feeds the sidebar badge
  priority: 'High' | 'Normal';
  tags: string[];
  orders: number;
  spend: Display;
}

interface Message {
  me: boolean;           // true = outbound
  t: string;
  at: Display;           // '10:02 AM'
}
```

In the mock, `thread` is a single shared conversation. In production this becomes
`Record<conversationId, Message[]>` or a fetch per thread.

---

## Assets, activity, notifications

```ts
interface Asset {
  name: string;          // ⚠ acts as the id — URL-encoded in the deep link
  type: 'Image' | 'Video' | 'Document' | 'Logo';
  dim: Display;          // '1080 × 1080'
  size: Display;
  ai: boolean;           // AI-generated badge
  when: Display;
  used: string[];        // campaign names — empty means unused
}

interface ActivityItem {
  t: string;
  ago: Display;
  kind: 'done' | 'ai';   // ✓ vs ✦
}

interface Notification {
  cat: 'Approvals' | 'AI' | 'Campaigns' | 'Connections' | 'System';
  t: string;
  d: string;
  ago: Display;
  unread: boolean;
  urgent?: boolean;      // rung 1 treatment
}
```

Give assets a real `id` in production. Using `name` as the key means a rename
breaks every existing deep link.

---

## Settings

```ts
interface TeamMember {
  name: string; email: string; role: string;
  initials: string; status: 'Active' | 'Invited';
}

interface Invoice  { id: string; date: Display; amount: Display; status: 'Paid' }
interface CreditUse { t: string; n: number; of: number }
```

---

## Derived values — do not send these

These are computed from the data above. Sending them creates two sources of
truth that will drift:

| Value | Derived from |
|---|---|
| Sidebar approvals badge | `approvals.filter(a => a.status === 'pending').length` |
| Conversations badge | `sum(conversations.unread)` |
| Home "needs attention" count | the same pending filter |
| Filter chip counts | the same collection |
| The mascot's face | `workspaceMood()` over approvals + connections |
| Campaign spend ratio | `spent / budget` |

**The invariant:** the sidebar badge, the Home count and the Approvals header all
read one collection. If your API returns a separate `pendingCount`, they can
disagree — and eventually they will.

---

## Suggested endpoints

A shape that maps cleanly onto the pages:

```
GET  /api/bootstrap                  → user, workspace, workspaces, credits
GET  /api/approvals?filter=          → Approval[]
POST /api/approvals/:id/approve      → { ok, approval }
POST /api/approvals/:id/reject       → { ok, approval }
POST /api/approvals/bulk             → { ids[], action }

GET  /api/connections                → Connection[]
POST /api/connections/:k/connect     → SSE or polled step progress
POST /api/connections/:k/disconnect

GET  /api/planner?month=YYYY-MM      → PlannerEvent[]
PATCH /api/planner/:id               → { d, time, stage }   // 409 on conflict

GET  /api/analytics?range=&channel=  → metrics, series, channelPerf, insights
POST /api/insights/:id/apply

GET  /api/campaigns                  → Campaign[]
POST /api/campaigns                  → launch (step progress)

GET  /api/brand                      → Brand
GET  /api/conversations              → Conversation[]
GET  /api/conversations/:id/messages → Message[]
GET  /api/assets                     → Asset[]
POST /api/ai/chat                    → grounded reply (see Chat.answer)
```

**Two notes.** The planner PATCH should return **409 with the conflicting event**
so the client can show the conflict dialog rather than re-deriving it. And any
long AI operation should stream its steps — `AITask` is built to consume staged
progress, and faking it with a timer is the one thing that will make the UI feel
dishonest.