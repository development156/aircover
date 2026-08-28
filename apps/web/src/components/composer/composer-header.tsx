'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ComposerHeaderProps {
  title: string
  onTitleChange: (title: string) => void
}

/**
 * The two decisions that apply to the whole post: what to call it, and where it
 * is going.
 *
 * ── THE CHANNEL ROW USED TO LIVE HERE, AND NO LONGER DOES ────────────────────
 * This file argued that channels must never be a step: the deleted five-step
 * wizard made changing your mind halfway through writing into a navigation.
 * Founder's ruling, 2026-08-28, reverses the placement — the screen is a
 * sequence, write first — and the picker moved to its own numbered section
 * below the writing pane. See `lib/posts/composer-steps.ts`.
 *
 * The half of the old argument worth keeping is kept there: this is not a
 * wizard, nothing is hidden, and once a step is reachable it stays reachable.
 * Changing your mind is still a scroll.
 *
 * The title is a plain `Input` rather than a borderless display-weight field.
 * docs/26 §5 forbids hand-writing a font shorthand and §10 lists the primitives
 * that exist; a document-title input is not one of them, and inventing it at a
 * call site is exactly how the type scale drifted in the first place.
 *
 * ── THE WAY BACK ─────────────────────────────────────────────────────────────
 * `docs/34` §10 named this screen the worst in the product and listed "no page
 * title, no back link" among the reasons. Only half of that is a defect: the
 * page's heading IS the title input, deliberately, and a visible "Write a post"
 * above a field labelled "Name this post" would be the second `type-h1` §16
 * forbids saying the same thing twice.
 *
 * The BACK LINK is a real gap and it is a momentum one. A person arrives here
 * by clicking a row on /posts, and the only route back was the rail — which on
 * a phone is behind "More", and which loses the list position either way. Same
 * treatment `radar/[id]` and the inbox threads use, so the product has one way
 * of returning from a detail screen rather than three.
 */
export function ComposerHeader({ title, onTitleChange }: ComposerHeaderProps) {
  return (
    <div className="space-y-4">
      <Link
        href="/posts"
        className="type-sm inline-flex items-center gap-1.5 text-muted transition-micro hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        All posts
      </Link>

      <div className="space-y-1.5">
        <Label htmlFor="post-title">Name this post</Label>
        <Input
          id="post-title"
          value={title}
          placeholder="Only you see this"
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </div>
    </div>
  )
}
