'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Channel, PostStatus } from '@sahoda/shared'

import { addPostsToCampaign } from '@/app/actions/campaigns'
import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { STATUS_WORD } from '@/lib/posts/status-word'

export interface AddablePost {
  id: string
  title: string | null
  status: PostStatus
  channels: readonly Channel[]
}

/**
 * Putting existing posts into a campaign.
 *
 * ── WHY THIS PICKS EXISTING POSTS RATHER THAN CREATING ONE ───────────────────
 * Membership is the whole feature. A campaign that could only hold posts written
 * from inside it would be a second, parallel place to write — and the writing
 * surface is `/create/post`, which knows about channels, the Brand Brain, the
 * constraint meter and the refusal gate. None of that should be rebuilt behind a
 * campaign, so this screen groups what exists and links to that one for the rest.
 *
 * ── THE LIST SHOWS WHAT A POST TARGETS, BECAUSE THAT IS WHAT GETS GROUPED ────
 * Each row carries its channels. That is not decoration: adding a LinkedIn-only
 * post to a campaign whose other posts are all Instagram is a real decision, and
 * the grid on the screen behind this one will grow a mostly-empty column because
 * of it. Better to see it here.
 */
export function AddPosts({
  campaignId,
  posts,
  unreadable,
}: {
  campaignId: string
  posts: readonly AddablePost[]
  /** True when the post list could not be read. Never rendered as "no posts". */
  unreadable: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [pending, startTransition] = useTransition()

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit() {
    const ids = [...picked]
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await addPostsToCampaign(campaignId, ids)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setOpen(false)
      setPicked(new Set())
      // The count comes from rows the database wrote, so a post someone else
      // added a second earlier is not counted twice — and the sentence stays
      // true when the two numbers differ.
      const skipped = ids.length - result.changed
      toast.success(
        skipped > 0
          ? `Added ${result.changed} — ${skipped} ${skipped === 1 ? 'was' : 'were'} already in`
          : `Added ${result.changed} ${result.changed === 1 ? 'post' : 'posts'}`,
      )
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={16} strokeWidth={2} aria-hidden />
        Add posts
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add posts to this campaign"
        description="Pick the posts that belong to this push. Adding one does not change the post."
      >
        {unreadable ? (
          <p className="type-body text-muted">
            Sahoda could not read your posts just now. Reload — this is not a sign that you have
            none.
          </p>
        ) : posts.length === 0 ? (
          <p className="type-body text-muted">
            Every post you have is already in this campaign. Write another one from Posts and it
            will show up here.
          </p>
        ) : (
          <ul className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto">
            {posts.map((post) => {
              const checked = picked.has(post.id)
              return (
                <li key={post.id}>
                  <label
                    className={[
                      'flex cursor-pointer items-start gap-3 rounded-input px-3 py-2 transition-micro',
                      'max-narrow:min-h-[44px]',
                      checked ? 'bg-s2' : 'hover:bg-s1',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      className="mt-[3px] size-[15px] shrink-0 accent-[var(--brand)]"
                      checked={checked}
                      onChange={() => toggle(post.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="type-h3 block truncate">
                        {post.title?.trim() || 'Untitled post'}
                      </span>
                      <span className="type-sm text-muted">
                        {STATUS_WORD[post.status]}
                        {post.channels.length > 0
                          ? ` · ${post.channels.map((channel) => CHANNEL_SHORT[channel]).join(', ')}`
                          : // A post with no channel picked yet. Said in words
                            // rather than left blank, because a blank here reads
                            // as a rendering gap.
                            ' · no channels picked'}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="type-sm text-muted">
            {picked.size > 0 ? `${picked.size} picked` : 'Nothing picked yet'}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              loading={pending}
              // A real control that is genuinely unavailable right now — the
              // customer fixes it by picking a post. That is what `disabled`
              // means, and it is never the way an unbuilt feature is marked.
              disabled={picked.size === 0}
            >
              Add to campaign
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
