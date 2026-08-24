import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  FileText,
  Globe,
  Image,
  Images,
  Megaphone,
  MessageSquare,
  Mic,
  PenLine,
  Pencil,
  Radar,
  Search,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Video,
  type LucideIcon,
} from 'lucide-react'

export { ChevronRight }

/**
 * The face a spend category wears: an icon, and one line saying what the
 * credits went ON.
 *
 * ── THE SUBTITLE IS A GERUND ON PURPOSE ──────────────────────────────────────
 * The reference this was built from reads "Variants generated" beside the
 * figure 3. The figure is CREDITS, not variants, so that pairing invites the
 * reader to conclude they generated three variants when they spent three
 * credits on one run at 3 credits each. "Generating post variants" cannot be
 * read as a count, and says the same thing.
 *
 * ── AND IT IS A DESCRIPTION, NOT A MEASUREMENT ───────────────────────────────
 * Naming what an action IS is knowable from the product. Nothing here is
 * derived from the spend, and nothing here may become a number. In particular a
 * run COUNT is deliberately absent: credits divided by today's unit price is
 * wrong for any spend charged at an older price, and it would look exactly as
 * confident as a real one.
 *
 * Keys mirror `ACTION_LABELS` in `lib/wallet/entry-copy.ts`, which is where the
 * user-facing NAME comes from. An action with no entry here still renders — it
 * takes the fallback icon and shows no subtitle, which is the honest response
 * to not knowing rather than a guessed sentence.
 */
export interface ActionFace {
  Icon: LucideIcon
  sub: string
}

const FACES: Readonly<Record<string, ActionFace>> = {
  caption_rewrite: { Icon: PenLine, sub: 'Rewriting captions' },
  inbox_reply: { Icon: MessageSquare, sub: 'Drafting inbox replies' },
  post_variants: { Icon: FileText, sub: 'Generating post variants' },
  twin_preflight: { Icon: ShieldCheck, sub: 'Checking posts before they go out' },
  image_standard: { Icon: Image, sub: 'Making standard images' },
  image_premium: { Icon: Sparkles, sub: 'Making premium images' },
  carousel: { Icon: Images, sub: 'Building carousels' },
  video_script: { Icon: Video, sub: 'Writing video scripts' },
  site_edit: { Icon: Pencil, sub: 'Editing your site' },
  loop_cycle: { Icon: CalendarDays, sub: 'Planning your week' },
  playbook_run: { Icon: BookOpen, sub: 'Running playbooks' },
  radar_scan: { Icon: Radar, sub: 'Scanning competitors' },
  seo_article: { Icon: Search, sub: 'Writing SEO articles' },
  remix_pack: { Icon: Shuffle, sub: 'Remixing what worked' },
  campaign_plan: { Icon: Megaphone, sub: 'Planning campaigns' },
  brand_research: { Icon: Search, sub: 'Researching your brand' },
  site_generate: { Icon: Globe, sub: 'Generating your site' },
  voice_minute: { Icon: Mic, sub: 'Voice minutes used' },
}

const FALLBACK: ActionFace = { Icon: Sparkles, sub: '' }

export function faceFor(action: string): ActionFace {
  return FACES[action] ?? FALLBACK
}
