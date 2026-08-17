import Link from 'next/link'
import {
  Bot,
  FileText,
  Image as ImageIcon,
  Mail,
  Megaphone,
  Newspaper,
  Radio,
  Send,
  SquarePen,
} from 'lucide-react'

import { ComingSoonTile } from '@/components/create/coming-soon-tile'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Create' }

/**
 * The Create chooser (reference: the nine-tile menu behind `+`, `C` and ⌘K).
 *
 * ── WHY EIGHT OF THE NINE ARE NOT LINKS ──────────────────────────────────────
 * Only Post exists. The founder's ruling is that the other eight are built as
 * visible, labelled coming-soon tiles rather than omitted: this screen IS the
 * roadmap, and a chooser with one option hides where the product is going.
 *
 * Each unbuilt tile says what it will be and nothing about the customer. There
 * are no counts, no "most used", no "recommended for you" — every one of those
 * would be a claim about this workspace that nothing here measures.
 *
 * ── WHY THIS IS A ROUTE AND NOT A MODAL ──────────────────────────────────────
 * The reference holds the whole create flow in one modal. This product stores
 * one body PER CHANNEL, and a modal has no room for per-channel editing beside
 * per-channel previews. Full-screen pages do. The chooser lives at the same
 * scale as the flow it opens.
 */

const REAL = {
  href: '/create/post',
  icon: SquarePen,
  title: 'Post',
  note: 'Write once, adapt per channel',
} as const

/** The roadmap, in the reference's own order. No tile carries a number. */
const SOON: readonly { icon: typeof Bot; title: string; note: string }[] = [
  { icon: ImageIcon, title: 'Story', note: 'Vertical, 24 hours, tap-through' },
  { icon: Megaphone, title: 'Campaign', note: 'Many posts under one goal' },
  { icon: Radio, title: 'Ad', note: 'Paid placement with a budget' },
  { icon: Send, title: 'Broadcast', note: 'One message to a subscriber list' },
  { icon: Newspaper, title: 'Article', note: 'Long-form, published to a channel' },
  { icon: Mail, title: 'Email', note: 'A campaign sent to your own list' },
  { icon: FileText, title: 'Report', note: 'What happened, written up' },
  { icon: Bot, title: 'Automation', note: 'A rule that runs without you' },
]

export default function CreateMenuPage() {
  return (
    <div className="space-y-grid">
      <div>
        <PageTitle>Create</PageTitle>
        <p className="mt-1 text-[13px] text-muted">
          Post is ready. The rest are on the way and are shown here so you can see what is coming.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {/* The one real option leads, and is the only thing that can be pressed. */}
        <Link
          href={REAL.href}
          data-guide="create.post"
          className="surface-ring flex flex-col items-start gap-2 rounded-card bg-surface px-3 py-3 transition-micro hover:bg-s2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-sm bg-brand-wash text-accent"
          >
            <REAL.icon size={16} strokeWidth={1.7} />
          </span>
          <span className="text-[13px] font-semibold">{REAL.title}</span>
          <span className="text-[11.5px] text-muted">{REAL.note}</span>
        </Link>

        {SOON.map((tile) => (
          <ComingSoonTile
            key={tile.title}
            icon={<tile.icon size={16} strokeWidth={1.7} />}
            title={tile.title}
            note={tile.note}
          />
        ))}
      </div>
    </div>
  )
}
