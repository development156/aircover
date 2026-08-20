'use client'

import { INSTAGRAM_MAX_COLLABORATORS } from '@sahoda/publishing/format'
import type { Channel } from '@sahoda/shared'
import type { PostFormat } from '@sahoda/publishing/format'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { VariantExtras } from '@/lib/posts/variant-extras'

/**
 * The three small per-channel controls: a first comment, co-authors, and the
 * label that says a picture was made by a model.
 *
 * ── PROGRESSIVE DISCLOSURE MEANS "ONLY WHERE IT IS REAL" ────────────────────
 * Each of these appears on exactly the channels that have it, which is not the
 * same set for any two of them:
 *
 *   · first comment — Instagram and LinkedIn. This is where hashtags go by
 *     convention, so it earns its place on a card that already has a hashtag box.
 *   · collaborators — Instagram only, and not on a Story, which has no
 *     co-author. Refused rather than sent, because Zernio checks nothing here and
 *     a control that quietly does nothing is the defect the Google button was.
 *   · the AI label — Instagram (`isAiGenerated`) and X (`madeWithAi`). Two
 *     platforms, two spellings, one idea.
 *
 * ── AND THE AI LABEL IS A POLICY GAP, NOT A FORMAT ONE ──────────────────────
 * This product GENERATES images — `image_generate`, 6 credits — and attaches them
 * to posts that go to Instagram and X. Both platforms expose a self-disclosure
 * flag and neither was ever set (docs/31 §3, last row). The checkbox is not
 * on by default: whether a post counts as AI-made is the writer's call about
 * their own business, and defaulting it either way answers for them.
 */

export interface ChannelExtrasProps {
  channel: Channel
  format: PostFormat | null
  extras: VariantExtras
  onExtrasChange: (patch: VariantExtras) => void
}

const HAS_FIRST_COMMENT: readonly Channel[] = ['instagram', 'linkedin']
const HAS_AI_LABEL: readonly Channel[] = ['instagram', 'x']

export function ChannelExtras({ channel, format, extras, onExtrasChange }: ChannelExtrasProps) {
  const showFirstComment = HAS_FIRST_COMMENT.includes(channel)
  const showCollaborators = channel === 'instagram' && format !== 'story'
  const showAiLabel = HAS_AI_LABEL.includes(channel)

  if (!showFirstComment && !showCollaborators && !showAiLabel) return null

  const collaborators = extras.collaborators ?? []

  return (
    <div className="narrow:col-span-2 space-y-2">
      {showFirstComment ? (
        <div className="space-y-1.5">
          <Label htmlFor={`first-comment-${channel}`}>First comment</Label>
          <Input
            id={`first-comment-${channel}`}
            data-first-comment={channel}
            value={extras.firstComment ?? ''}
            placeholder="#chai #pune"
            onChange={(event) => onExtrasChange({ firstComment: event.target.value })}
          />
          <p className="text-[12.5px] text-muted">
            Posted as a reply the moment this goes out. Where most people put their hashtags.
          </p>
        </div>
      ) : null}

      {showCollaborators ? (
        <div className="space-y-1.5">
          <Label htmlFor="collaborators">Invite a co-author</Label>
          <Input
            id="collaborators"
            data-collaborators
            value={collaborators.join(', ')}
            placeholder="@theirhandle"
            onChange={(event) =>
              onExtrasChange({
                collaborators: event.target.value
                  .split(',')
                  .map((name) => name.trim())
                  .filter((name) => name !== ''),
              })
            }
          />
          <p className="text-[12.5px] text-muted">
            Up to <span className="tabular-nums">{INSTAGRAM_MAX_COLLABORATORS}</span> Instagram
            accounts, separated by commas. The post appears on their profile too, once they accept.
          </p>
        </div>
      ) : null}

      {showAiLabel ? (
        <label className="flex items-start gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            data-ai-label={channel}
            checked={extras.aiGenerated === true}
            onChange={(event) =>
              onExtrasChange({ aiGenerated: event.target.checked ? true : undefined })
            }
            className="mt-icon-nudge size-4 shrink-0 accent-[var(--acc)]"
          />
          <span>
            Label this as made with AI
            <span className="block text-[12.5px] text-muted">
              Tells {channel === 'x' ? 'X' : 'Instagram'} the image was generated. Worth setting on
              anything Sahoda drew.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  )
}
