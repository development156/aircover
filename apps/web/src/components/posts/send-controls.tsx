'use client'

import { useState } from 'react'
import { Save, Send } from 'lucide-react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { ChannelReadout } from '@/components/posts/channel-readout'
import { joinNames } from '@/lib/posts/connection-gap'

export interface SendControlsProps {
  /** Every channel on the post — what the readout lists. */
  channels: ChannelSet
  /** Channels a press would actually reach: on the rail AND connected. */
  live: readonly Channel[]
  connected?: ReadonlySet<Channel>
  /** How many channel versions are not in their row yet. */
  unsavedVersions: number
  /** Write the post and every dirty version. Resolves false if any save failed. */
  onSaveDraft: () => Promise<boolean>
  /** Save everything, then publish to `live`. */
  onSendNow: () => void
  /** True while a publish is in flight. */
  sending: boolean
}

/**
 * THE TWO THINGS A FINISHED POST CAN DO, TOGETHER, WHERE THE READER ENDS UP.
 *
 * ── WHAT THIS REPLACES, AND WHY THE OLD SHAPE WAS THE PROBLEM ────────────────
 * Saving lived in a sticky bar pinned to the bottom of the window; sending lived
 * in this panel behind a per-channel chip rail. So the two endings to the same
 * piece of work sat in different places, one of them floating over the other,
 * and neither said where the post was going. The founder's words for it: bring
 * them together, below the dry run, and show the channels here too.
 *
 * ── SAVE AS DRAFT SAVES EVERYTHING, WITHOUT BEING ASKED TWICE ────────────────
 * It writes the post AND every channel version that is not in its row yet. The
 * old bar asked for that separately ("Save all versions") which meant a reader
 * could press Save, believe their work was safe, and lose four channel variants.
 *
 * ── SEND NOW REACHES EVERY CONNECTED CHANNEL, AND STILL REPORTS PER CHANNEL ──
 * This panel used to argue against a single Send button, on the grounds that one
 * post can be live on Instagram and failed on X in the same second and a single
 * verdict cannot cover both. That argument was right about the REPORT and wrong
 * about the BUTTON: the fix is one press and N results, not N presses. The
 * confirm panel below names every channel the press will reach, and the outcome
 * list that follows carries one row per channel with its own verdict.
 *
 * ── AND IT STILL CONFIRMS ────────────────────────────────────────────────────
 * Sending is the one irreversible act on this screen. The first press names what
 * is about to happen and to whom; the second does it.
 */
export function SendControls({
  channels,
  live,
  connected,
  unsavedVersions,
  onSaveDraft,
  onSendNow,
  sending,
}: SendControlsProps) {
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  /** What the last draft save actually did. Null until one has been pressed. */
  const [saveResult, setSaveResult] = useState<'ok' | 'failed' | null>(null)

  const names = joinNames(live.map((channel) => CHANNEL_LABELS[channel]))
  const busy = saving || sending

  async function saveDraft() {
    setSaving(true)
    setSaveResult(null)
    // The VERDICT, not the fact that it finished. `saveAll` resolving false
    // means a version did not reach its row, and "Saved" over that is the
    // half-truth this product refuses.
    const ok = await onSaveDraft()
    setSaving(false)
    setSaveResult(ok ? 'ok' : 'failed')
  }

  return (
    <div className="space-y-3" data-send-controls>
      {/* WHERE IT IS GOING, ABOVE THE BUTTONS THAT ACT ON IT — the same list the
          schedule route shows, because it answers the same question at the same
          moment. It was only on one of the two routes. */}
      <ChannelReadout channels={channels} connected={connected} />

      <div className="flex flex-wrap items-center gap-2">
        {/* Draft first and in the quieter treatment: it is the safe half of the
            pair, and the loud one is the irreversible one. */}
        <Button
          variant="secondary"
          data-send-save-draft
          loading={saving}
          disabled={busy}
          onClick={() => void saveDraft()}
        >
          <Save size={14} aria-hidden />
          Save as draft
        </Button>

        {/* ── ALWAYS RENDERED, SOMETIMES REFUSED ───────────────────────────
            This was hidden outright when no channel could receive the post, on
            the principle that a button which cannot work is worse than no
            button. MEASURED on the live preview with four unconnected channels:
            what the reader actually got was a lone "Save as draft" and a gap
            where the point of the screen should be, with no way to tell whether
            sending was missing, broken, or somewhere else entirely. Founder's
            ruling, REQUESTS §33: the send button is the shape of this panel and
            it stays.

            Disabled, not hidden, and the reason is directly above it — the warn
            block naming every unconnected channel with a link to connect one.
            That is the difference between a refusal and a dead end. It is also
            why `disabled` is honest here rather than the coming-soon pattern
            `design-lint` rule 3 forbids: nothing is unfinished, the account is
            simply not connected yet, and the remedy is one link away. */}
        <Button
          data-send-now
          disabled={live.length === 0 || busy || confirming}
          onClick={() => {
            setSaveResult(null)
            setConfirming(true)
          }}
        >
          <Send size={14} aria-hidden />
          Send now
        </Button>
      </div>

      {/* ── BELOW THE BUTTONS, NOT ABOVE THEM ───────────────────────────────
          The first version opened this panel above the pair. Pressing "Send now"
          therefore inserted ~230px directly under the reader's pointer and shoved
          the button they had just hit down the page — so the next thing under the
          cursor was a different control, on the one screen where a mis-click
          publishes. The question now appears where a question should: under the
          thing that asked it. */}
      {confirming && live.length > 0 ? (
        <div className="surface-ring space-y-2 rounded-card bg-s2 p-3" data-send-confirm>
          <p className="type-sm text-ink">
            {/* Names them. "Confirm" over a list the reader has to scroll back to
                is a word that could mean anything by the time they reach it. */}
            This posts to {names} for real, straight away.
            {live.includes('instagram') ? ' Instagram takes about fifteen seconds to finish.' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button data-send-confirm-go loading={sending} onClick={onSendNow}>
              <Send size={14} aria-hidden />
              Confirm and send to{' '}
              {live.length === 1 ? CHANNEL_LABELS[live[0]!] : `${live.length} channels`}
            </Button>
            <Button variant="secondary" disabled={sending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── WHAT EACH BUTTON WILL DO, IN ADVANCE ─────────────────────────────
          Both of these save every unsaved version, and a reader who does not
          know that will press Save first out of caution and wonder what the
          other one skipped. */}
      <p className="type-meta text-muted" data-send-note>
        {/* ── TWO REASONS NOTHING CAN GO OUT, AND THEY ARE NOT THE SAME ────────
            "Connect an account" is useless advice to somebody who has connected
            three and picked none, and it is the state this panel is easiest to
            reach in: a post whose channels were all unticked keeps this part
            reachable, because a part already earned never shuts under the
            cursor. Each sentence names the remedy that can actually work. */}
        {channels.length === 0
          ? unsavedVersions > 0
            ? 'Save as draft writes the post and every version you have written. Nothing goes out until you choose a platform.'
            : 'Nothing goes out until you choose a platform.'
          : live.length === 0
            ? unsavedVersions > 0
              ? 'Save as draft writes the post and every version you have written. Nothing goes out until a channel is connected.'
              : 'Nothing goes out until a channel is connected.'
            : unsavedVersions > 0
              ? 'Both of these save the post and every version you have written first. Send now then goes out for real.'
              : 'Send now goes out for real. Nothing is sent until you confirm it.'}
      </p>

      {saveResult === 'ok' ? (
        // Says the second half out loud. A person who has just pressed a button
        // beside one marked "Send now" wants to know which one they hit.
        <p role="status" className="type-meta text-ok" data-send-saved>
          Saved as a draft. Nothing has gone out.
        </p>
      ) : saveResult === 'failed' ? (
        <p role="alert" className="type-meta text-danger" data-send-save-failed>
          Sahoda couldn&rsquo;t save everything, so some of your versions are still only on this
          screen. Try again.
        </p>
      ) : null}
    </div>
  )
}
