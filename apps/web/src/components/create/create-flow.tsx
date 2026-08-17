'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Image as ImageIcon, MapPin, SquarePen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CONSTRAINTS, type Channel } from '@sahoda/shared'

import { ComingSoonTile } from '@/components/create/coming-soon-tile'
import { StepIndicator } from '@/components/create/step-indicator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'

/**
 * The five-step create flow, as FULL-SCREEN PAGES.
 *
 * ── WHY NOT THE REFERENCE'S MODAL ────────────────────────────────────────────
 * The reference holds all of this in one overlay, and its Content step has ONE
 * body: "Write the post once — AI shapes it per channel", a single textarea and
 * a single 2200 counter. Per-channel copy appears only as read-only previews.
 *
 * This product does not work that way. It stores one body PER CHANNEL in
 * `post_variants`, each with its own Constraint Engine limit and its own
 * publish_status. A modal has nowhere to put four editors and four previews, so
 * the flow is full-screen and the Content step diverges from the reference on
 * purpose: one editable body per selected channel. That divergence IS the
 * requirement, not a shortcut around it.
 *
 * ── STEP LIVES IN THE URL ────────────────────────────────────────────────────
 * `?step=` rather than component state, so Back works, a step is linkable, and
 * each step can be enumerated independently. A wizard whose state is invisible
 * to the address bar can only ever be tested in one of its states.
 *
 * ── WHAT THIS FLOW NEVER DOES ────────────────────────────────────────────────
 * It renders no predicted reach, no engagement rate, no template count, no
 * "audience peaks at" window and no revenue share. Every one of those is a
 * claim about the customer's business that no query in this codebase can
 * produce. Containers for them exist and are labelled coming soon; the numbers
 * do not exist at all.
 */

const STEPS = ['Channel', 'Format', 'Content', 'Preview', 'Schedule'] as const
type StepKey = 'channel' | 'format' | 'content' | 'preview' | 'schedule'
const ORDER: readonly StepKey[] = ['channel', 'format', 'content', 'preview', 'schedule']

/** The four channels with adapters, in the reference's reading order. */
const REAL_CHANNELS: readonly Channel[] = ['instagram', 'linkedin', 'x', 'gbp']

/**
 * Channels the reference shows that this product cannot publish to.
 *
 * Their marks ship in the package (`public/channels/`), so the tiles are real
 * tiles rather than grey boxes — the roadmap made visible, per the ruling.
 */
const SOON_CHANNELS: readonly { key: string; label: string; mark: string }[] = [
  { key: 'facebook', label: 'Facebook', mark: '/channels/facebook.png' },
  { key: 'tiktok', label: 'TikTok', mark: '/channels/tiktok.png' },
  { key: 'youtube', label: 'YouTube', mark: '/channels/youtube.png' },
  { key: 'whatsapp', label: 'WhatsApp', mark: '/channels/whatsapp.png' },
  { key: 'telegram', label: 'Telegram', mark: '/channels/telegram.png' },
]

const MARK: Partial<Record<Channel, string>> = {
  instagram: '/channels/instagram.png',
  linkedin: '/channels/linkedin.png',
  x: '/channels/x.png',
}

/** GBP ships no mark in the package; google-ads.png is a different product. */
function ChannelMark({ channel, size = 22 }: { channel: Channel; size?: number }) {
  const src = MARK[channel]
  if (!src) {
    return (
      <span
        aria-hidden
        data-channel={channel}
        className="grid shrink-0 place-items-center rounded-sm bg-s2 text-muted"
        style={{ width: size, height: size }}
      >
        <MapPin size={Math.round(size * 0.62)} strokeWidth={1.8} />
      </span>
    )
  }
  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      data-channel={channel}
      width={size}
      height={size}
      className="shrink-0 rounded-sm"
    />
  )
}

export function CreateFlow({ connected }: { connected: readonly Channel[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const raw = params.get('step')
  const step: StepKey = (ORDER as readonly string[]).includes(raw ?? '')
    ? (raw as StepKey)
    : 'channel'
  const index = ORDER.indexOf(step)

  const [channels, setChannels] = useState<Channel[]>([])
  // One body per channel. Keyed by channel, never a single shared string —
  // collapsing these into one field is the exact regression R1 forbids.
  const [bodies, setBodies] = useState<Partial<Record<Channel, string>>>({})

  const connectedSet = useMemo(() => new Set(connected), [connected])

  function go(next: StepKey) {
    router.push(`/create/post?step=${next}`)
  }

  function toggle(channel: Channel) {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    )
  }

  const canContinue = step !== 'channel' || channels.length > 0

  return (
    <div className="space-y-grid" data-guide="create.flow">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[20px] leading-7 font-[650] tracking-[-0.02em]">New post</h1>
          <p className="mt-[1px] text-[13px] text-muted">
            Step {index + 1} of 5 · {STEPS[index]}
          </p>
        </div>
        {/* SPECIFICATION.md §10: every tappable control clears 44px on a phone,
            while desktop stays dense. A 20px-tall text link is comfortable with
            a mouse and a miss with a thumb, so the height is added at
            max-narrow only. */}
        <Link
          href="/posts"
          className="-mx-2 inline-flex items-center rounded-sm px-2 text-[13px] font-semibold text-muted transition-micro hover:text-ink max-narrow:min-h-[44px]"
        >
          Cancel
        </Link>
      </div>

      <StepIndicator steps={STEPS} current={index} />

      <div className="min-h-[320px]">
        {step === 'channel' ? (
          <StepChannel channels={channels} connectedSet={connectedSet} onToggle={toggle} />
        ) : null}
        {step === 'format' ? <StepFormat /> : null}
        {step === 'content' ? (
          <StepContent channels={channels} bodies={bodies} onChange={setBodies} />
        ) : null}
        {step === 'preview' ? <StepPreview channels={channels} bodies={bodies} /> : null}
        {step === 'schedule' ? <StepSchedule /> : null}
      </div>

      {/* Back / Continue, in the reference's placement: back left, primary
          right. Both clear 44px on a phone (SPECIFICATION.md §10) and keep the
          kit's dense 34px on desktop. */}
      <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
        {index > 0 ? (
          <Button
            variant="secondary"
            className="max-narrow:min-h-[44px]"
            onClick={() => go(ORDER[index - 1]!)}
          >
            <ArrowLeft size={15} strokeWidth={1.9} aria-hidden />
            Back
          </Button>
        ) : (
          <span />
        )}
        {index < ORDER.length - 1 ? (
          <Button
            variant="primary"
            className="max-narrow:min-h-[44px]"
            disabled={!canContinue}
            onClick={() => go(ORDER[index + 1]!)}
          >
            Continue
            <ArrowRight size={15} strokeWidth={1.9} aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/* ── 1 · CHANNEL ─────────────────────────────────────────────────────────────
   No "Pre-selected for you" panel. The reference's rationale reads "Instagram
   drives 38% of your revenue" — this product holds no revenue data of any kind,
   so there is nothing to pre-select FROM and nothing true to say about why. */
function StepChannel({
  channels,
  connectedSet,
  onToggle,
}: {
  channels: readonly Channel[]
  connectedSet: ReadonlySet<Channel>
  onToggle: (c: Channel) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        Pick one or more channels. Sahoda writes the post once and adapts it per channel.
      </p>

      <div className="grid grid-cols-4 gap-2 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {REAL_CHANNELS.map((channel) => {
          const on = channels.includes(channel)
          return (
            <button
              key={channel}
              type="button"
              data-channel-tile={channel}
              aria-pressed={on}
              onClick={() => onToggle(channel)}
              className={[
                'surface-ring flex items-center gap-2 rounded-card bg-surface px-3 py-3 text-left transition-micro',
                on ? 'bg-brand-wash shadow-[inset_0_0_0_1.5px_var(--brand)]' : 'hover:bg-s2',
              ].join(' ')}
            >
              <ChannelMark channel={channel} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-[550]">
                  {CHANNEL_LABELS[channel]}
                </span>
                {/* Not connected is stated, and is NOT a blocker: writing and
                    planning work without a connection. Saying so here stops the
                    tile reading as disabled. */}
                <span className="block text-[11.5px] text-muted">
                  {connectedSet.has(channel) ? 'Connected' : 'Not connected · you can still write'}
                </span>
              </span>
              {on ? (
                <Check size={15} strokeWidth={2.4} className="shrink-0 text-accent" aria-hidden />
              ) : null}
            </button>
          )
        })}

        {SOON_CHANNELS.map((c) => (
          <ComingSoonTile
            key={c.key}
            icon={<Image src={c.mark} alt="" aria-hidden width={18} height={18} />}
            title={c.label}
          />
        ))}
      </div>

      {channels.length > 1 ? (
        <p className="text-[12.5px] text-muted">
          {channels.length} channels selected. Each one gets its own copy on the next screens.
        </p>
      ) : null}
    </div>
  )
}

/* ── 2 · FORMAT ──────────────────────────────────────────────────────────────
   ONE real format. packages/shared/src/publishing/constraints.ts carries no
   format field at all: every channel's `mediaTypes` is image-only (x:121,
   gbp:133, linkedin:146, instagram:160 — no video mime anywhere), and
   `PublishDraft` (:53-63) has one shape per channel with no format
   discriminator. Validation branches on maxChars, maxMediaCount, requiresMedia
   and mediaTypes, and on nothing else.

   So Post is selectable and the other four are coming soon. A chooser where
   picking Reel changed nothing would be a fake success state; a chooser where
   the unbuilt options say they are unbuilt is honest. */
function StepFormat() {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        Choose a format. Each channel&rsquo;s limits are applied automatically.
      </p>

      <div className="grid grid-cols-5 gap-2 max-wide:grid-cols-3 max-narrow:grid-cols-1">
        <div
          data-format="post"
          aria-current="true"
          className="surface-ring flex flex-col items-start gap-2 rounded-card bg-brand-wash px-3 py-3 shadow-[inset_0_0_0_1.5px_var(--brand)]"
        >
          <span aria-hidden className="grid size-7 place-items-center text-accent">
            <SquarePen size={16} strokeWidth={1.7} />
          </span>
          <span className="text-[13px] font-semibold">Post</span>
          <span className="text-[11.5px] text-muted">Text and images</span>
          <Badge rung="active">Selected</Badge>
        </div>

        {['Carousel', 'Story', 'Reel', 'Video'].map((f) => (
          <ComingSoonTile key={f} icon={<ImageIcon size={16} strokeWidth={1.7} />} title={f} />
        ))}
      </div>

      <p className="text-[12.5px] text-muted">
        Post is the only format Sahoda publishes today. A post can carry more than one image on the
        channels that allow it.
      </p>
    </div>
  )
}

/* ── 3 · CONTENT ─────────────────────────────────────────────────────────────
   R1 LIVES HERE. One editable body per selected channel, each with its own
   Constraint Engine limit read from CONSTRAINTS[channel].maxChars, and each
   showing its own over-limit state. The reference has one shared body; this
   deliberately does not. */
function StepContent({
  channels,
  bodies,
  onChange,
}: {
  channels: readonly Channel[]
  bodies: Partial<Record<Channel, string>>
  onChange: (next: Partial<Record<Channel, string>>) => void
}) {
  if (channels.length === 0) {
    return (
      <p className="text-[13px] text-muted">Pick a channel first and its editor appears here.</p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 max-narrow:grid-cols-1">
        <div className="surface-ring rounded-card bg-surface px-3 py-3">
          <span className="block text-[13px] font-semibold">Start from scratch</span>
          <span className="mt-1 block text-[11.5px] text-muted">
            A blank editor for each channel
          </span>
        </div>
        <div className="surface-ring rounded-card bg-surface px-3 py-3">
          <span className="block text-[13px] font-semibold">Generate with AI</span>
          <span className="mt-1 block text-[11.5px] text-muted">
            Uses your Brand Brain · spends credits
          </span>
        </div>
        {/* The reference says "14 templates matched to your industry". There is
            no templates table, so the card exists and the COUNT does not. */}
        <ComingSoonTile title="Use a template" note="Starting points for common posts" />
      </div>

      {channels.map((channel) => {
        const value = bodies[channel] ?? ''
        const limit = CONSTRAINTS[channel].maxChars
        const over = value.length > limit
        return (
          <div key={channel} className="surface-ring rounded-card bg-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <ChannelMark channel={channel} size={18} />
              <label htmlFor={`create-variant-${channel}`} className="text-[13px] font-semibold">
                {CHANNEL_LABELS[channel]} copy
              </label>
            </div>
            <textarea
              id={`create-variant-${channel}`}
              data-variant-editor={channel}
              rows={5}
              value={value}
              onChange={(e) => onChange({ ...bodies, [channel]: e.target.value })}
              placeholder={`Write the ${CHANNEL_LABELS[channel]} version.`}
              className="w-full rounded-input border border-line bg-bg px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-[11.5px] text-muted">
                {CONSTRAINTS[channel].requiresMedia === true
                  ? 'This channel needs at least one image.'
                  : ' '}
              </span>
              <span
                data-limit={channel}
                className={`text-[11.5px] tabular-nums ${over ? 'font-semibold text-danger' : 'text-muted'}`}
              >
                {value.length.toLocaleString('en-IN')} / {limit.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── 4 · PREVIEW ─────────────────────────────────────────────────────────────
   One preview per selected channel. Predicted performance is a container with
   no numbers: there is no prediction engine, and this is the screen where
   someone decides whether to publish — the worst possible place for a figure
   nothing measured. */
function StepPreview({
  channels,
  bodies,
}: {
  channels: readonly Channel[]
  bodies: Partial<Record<Channel, string>>
}) {
  if (channels.length === 0) {
    return (
      <p className="text-[13px] text-muted">Pick a channel first and its preview appears here.</p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">This is how the post lands on each channel.</p>

      <div className="grid grid-cols-2 gap-3 max-narrow:grid-cols-1">
        {channels.map((channel) => (
          <div
            key={channel}
            data-preview={channel}
            className="surface-ring overflow-hidden rounded-card bg-surface"
          >
            <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
              <ChannelMark channel={channel} size={18} />
              <span className="text-[12.5px] font-semibold">{CHANNEL_LABELS[channel]}</span>
            </div>
            <div className="grid aspect-square place-items-center bg-s2 text-muted">
              <ImageIcon size={22} strokeWidth={1.5} aria-hidden />
            </div>
            <p className="px-3 py-3 text-[12.5px] whitespace-pre-wrap">
              {bodies[channel]?.trim() ? (
                bodies[channel]
              ) : (
                <span className="text-muted">Nothing written for this channel yet.</span>
              )}
            </p>
          </div>
        ))}
      </div>

      <ComingSoonTile
        title="Predicted performance"
        note="How this post is likely to do, before it goes out"
        className="w-full"
      />
    </div>
  )
}

/* ── 5 · SCHEDULE ────────────────────────────────────────────────────────────
   Plain date and time. The reference badges the field "AI recommended" and
   says "audience peaks between 9:40 and 10:20"; no timing analysis exists in
   this product, so there is no badge and no window. */
function StepSchedule() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 max-narrow:grid-cols-1">
        {[
          ['Publish now', 'Goes out on every selected channel'],
          ['Schedule', 'Pick a date and time'],
          ['Save as draft', 'Keep it in the planner'],
        ].map(([title, note]) => (
          <div key={title} className="surface-ring rounded-card bg-surface px-3 py-3">
            <span className="block text-[13px] font-semibold">{title}</span>
            <span className="mt-1 block text-[11.5px] text-muted">{note}</span>
          </div>
        ))}
      </div>

      <div className="surface-ring rounded-card bg-surface p-3">
        <span className="block text-[12.5px] font-semibold">When</span>
        <div className="mt-2 flex gap-2 max-narrow:flex-col">
          <input
            type="date"
            aria-label="Date"
            className="rounded-input border border-line bg-bg px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            type="time"
            aria-label="Time"
            className="rounded-input border border-line bg-bg px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          Sahoda does not suggest a time yet. Pick whatever suits you.
        </p>
      </div>
    </div>
  )
}
